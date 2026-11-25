import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { all } from '@/lib/database';

export const runtime = 'nodejs';
export async function GET() {
  if ((await currentUser())?.role !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato al Narratore.' }, { status: 403 });
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  const sheets = [
    [
      'Studenti',
      "SELECT id,first_name,last_name,class_code,crew_id,roles FROM users WHERE role='student' ORDER BY class_code,last_name",
    ],
    ['Ciurme', 'SELECT id,name,class_code FROM crews ORDER BY class_code,name'],
    [
      'Rotte',
      'SELECT id,class_code,year,ordinal,name,start_date,end_date FROM routes ORDER BY class_code,year,ordinal',
    ],
    [
      'Registro',
      'SELECT date,user_id,subject,presence,phone,bug,anxiety,mystery,weapon,multiverse,multiverse_points,fruit_points,fruit_note FROM daily ORDER BY date,user_id',
    ],
    ['Voti', 'SELECT user_id,date,type,grade,points FROM grades ORDER BY date,user_id'],
    [
      'Movimenti',
      'SELECT user_id,date,type,points,grade,source,source_row FROM point_events ORDER BY date,user_id',
    ],
  ] as const;
  for (const [name, query] of sheets) {
    const data = await all<Record<string, string | number | null>>(query);
    const sheet = book.addWorksheet(name);
    if (!data.length) continue;
    const keys = Object.keys(data[0]);
    sheet.addRow(keys);
    for (const row of data) sheet.addRow(keys.map((key) => row[key]));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 20;
    });
  }
  const buffer = await book.xlsx.writeBuffer();
  return new Response(buffer as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="registro-punti.xlsx"',
      'Cache-Control': 'private, no-store',
    },
  });
}
