import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { all, database, one, run, transaction } from '@/lib/database';
import { isISODate } from '@/lib/dates';
import { isSameOrigin } from '@/lib/security';
import { importPuntiWorkbook } from '@/lib/punti-import';
import { importKey, parsePlanningSheet, parseStudentsSheet } from '@/lib/planning-import';
import { graduatingStudents } from '@/lib/annual-roster';
import {
  isPlanningKind,
  PLANNING_IMPORT_LOCK,
  planningSheet,
  validatePlanningValues,
  type PlanningKind,
} from '@/lib/planning';

export const runtime = 'nodejs';
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
async function rows(kind: PlanningKind) {
  return (
    await all<{ id: number; data: string }>(
      'SELECT id,data FROM imported_rows WHERE sheet=? ORDER BY id',
      planningSheet(kind),
    )
  ).map((row) => ({ id: Number(row.id), kind, values: JSON.parse(row.data), version: row.data }));
}
async function allowed(request?: NextRequest) {
  const user = await currentUser();
  return user?.role === 'admin' && (!request || isSameOrigin(request));
}
export async function GET(request: NextRequest) {
  if (!(await allowed())) return fail('Accesso riservato al Narratore.', 403);
  const kind = request.nextUrl.searchParams.get('kind');
  if (request.nextUrl.searchParams.get('export') === '1' && isPlanningKind(kind)) {
    const ExcelJS = (await import('exceljs')).default;
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(kind === 'planning' ? 'Planning' : 'Studenti');
    const fields =
      kind === 'planning'
        ? [
            ['date', 'Data'],
            ['classCode', 'Classe'],
            ['subject', 'Disciplina'],
            ['coTeacher', 'Codocente'],
            ['topic', 'Argomento'],
            ['notes', 'Note'],
          ]
        : [
            ['classCode', 'Classe'],
            ['number', 'Nr.'],
            ['student', 'Alunno/a'],
            ['crew', 'Ciurma'],
            ['entryExit', 'Entrate/Uscite'],
            ['device', 'Pc/Tablet'],
            ['certification', 'Certificazione'],
            ['printTests', 'Stampa Verifiche'],
            ['lessonHour', 'Ora di lezione'],
            ['entry', 'Entrata'],
            ['exit', 'Uscita'],
          ];
    sheet.addRow(fields.map((field) => field[1]));
    for (const row of await rows(kind))
      sheet.addRow(fields.map(([name]) => row.values[name] || ''));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 22;
    });
    const buffer = await book.xlsx.writeBuffer();
    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${kind}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return NextResponse.json(
    { planning: await rows('planning'), students: await rows('students') },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export async function POST(request: NextRequest) {
  if (!(await allowed(request))) return fail('Accesso riservato al Narratore.', 403);
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await request.formData();
    const kind = form.get('kind');
    const file = form.get('file');
    const annual = form.get('annual') === '1';
    if (
      !(isPlanningKind(kind) || kind === 'workbook') ||
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith('.xlsx') ||
      file.size > 8_000_000
    )
      return fail('Seleziona un file Excel .xlsx di massimo 8 MB.');
    const ExcelJS = (await import('exceljs')).default;
    const book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    } catch {
      return fail('Impossibile leggere il file Excel.');
    }
    const sheetNamed = (name: string) =>
      book.worksheets.find(
        (sheet) => sheet.name.trim().toLocaleLowerCase('it-IT') === name.toLocaleLowerCase('it-IT'),
      );
    const planning = kind !== 'students' ? sheetNamed('Planning') : undefined;
    const students = kind !== 'planning' ? sheetNamed('Studenti') : undefined;
    if (
      (kind === 'planning' && !planning) ||
      (kind === 'students' && !students) ||
      (kind === 'workbook' && !planning && !students)
    )
      return fail('Il file non contiene il foglio richiesto (Planning o Studenti).');
    try {
      if (annual && (kind !== 'workbook' || !students))
        return fail('Per l’importazione annuale serve il foglio Studenti.');
      const studentRows = students ? parseStudentsSheet(students) : [];
      const count = (planning ? parsePlanningSheet(planning).length : 0) + studentRows.length;
      if (!count) return fail('Il file non contiene righe da importare.');
      if (annual && !studentRows.length)
        return fail('Il foglio Studenti non può essere vuoto nell’importazione annuale.');
      if (annual && form.get('preview') === '1')
        return NextResponse.json(
          {
            ok: true,
            graduating: await graduatingStudents(database(), studentRows),
            count,
            counts: {
              Planning: planning ? parsePlanningSheet(planning).length : 0,
              Studenti: studentRows.length,
            },
          },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      let graduatedIds: number[] | undefined;
      if (annual) {
        try {
          graduatedIds = JSON.parse(String(form.get('graduatedIds') || ''));
        } catch {
          return fail('Controlla l’anteprima degli studenti prima di confermare.');
        }
        if (
          !Array.isArray(graduatedIds) ||
          graduatedIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
          new Set(graduatedIds).size !== graduatedIds.length
        )
          return fail('Elenco degli studenti non valido.');
      }
      const result = await importPuntiWorkbook(database(), book, 'Punti.xlsx', false, {
        students: kind !== 'planning',
        planning: kind !== 'students',
        points: false,
        graduatedIds,
      });
      return NextResponse.json({
        ok: true,
        count,
        counts: {
          Planning: result.planning,
          Studenti: result.students,
          Ciurme: result.crews,
          Rimossi: result.removed,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return fail(
        /^(Planning|Studenti|Il foglio)/.test(message)
          ? message
          : 'Importazione interrotta: controlla il file e riprova.',
      );
    }
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Dati non validi.');
  }
  if (!body || !isPlanningKind(body.kind)) return fail('Tabella non valida.');
  const kind = body.kind;
  const id = Number(body.id);
  return transaction(async () => {
    if (database().dialect === 'postgres')
      await database().prepare('SELECT pg_advisory_xact_lock(?)').get(PLANNING_IMPORT_LOCK);
    if (body.action === 'delete') {
      if (!Number.isSafeInteger(id) || id <= 0) return fail('Riga non valida.');
      const result = await run(
        'DELETE FROM imported_rows WHERE id=? AND sheet=?',
        id,
        planningSheet(kind),
      );
      return result.changes ? NextResponse.json({ ok: true }) : fail('Riga non trovata.', 404);
    }
    const value = validatePlanningValues(kind, body.values);
    if (!value || (kind === 'planning' && !isISODate(value.date)))
      return fail('Controlla i campi obbligatori, la data e gli orari.');
    if (kind === 'students') {
      const current = await all<{ id: number; data: string }>(
        'SELECT id,data FROM imported_rows WHERE sheet=?',
        planningSheet(kind),
      );
      const duplicate = current.some((row) => {
        if (body.action === 'update' && Number(row.id) === id) return false;
        try {
          const existing = JSON.parse(row.data);
          return (
            importKey(existing.classCode) === importKey(value.classCode) &&
            importKey(existing.student) === importKey(value.student)
          );
        } catch {
          return false;
        }
      });
      if (duplicate)
        return fail('Questo studente è già presente nel Planning per la classe indicata.', 409);
    }
    if (body.action === 'update') {
      if (!Number.isSafeInteger(id) || id <= 0) return fail('Riga non valida.');
      const stored = await one<{ data: string }>(
        'SELECT data FROM imported_rows WHERE id=? AND sheet=?',
        id,
        planningSheet(kind),
      );
      if (!stored) return fail('Riga non trovata.', 404);
      if (typeof body.expected !== 'string' || body.expected !== stored.data)
        return fail('La riga è cambiata nel frattempo. Ricarica e riprova.', 409);
      const previous = JSON.parse(stored.data) as { _studentId?: string };
      if (kind === 'students' && previous._studentId) value._studentId = previous._studentId;
      const result = await run(
        'UPDATE imported_rows SET data=? WHERE id=? AND sheet=? AND data=?',
        JSON.stringify(value),
        id,
        planningSheet(kind),
        stored.data,
      );
      if (!result.changes)
        return fail('La riga è cambiata nel frattempo. Ricarica e riprova.', 409);
    } else if (body.action === 'create') {
      await run(
        'INSERT INTO imported_rows(sheet,data) VALUES(?,?)',
        planningSheet(kind),
        JSON.stringify(value),
      );
    } else return fail('Operazione non valida.');
    return NextResponse.json({ ok: true });
  });
}
