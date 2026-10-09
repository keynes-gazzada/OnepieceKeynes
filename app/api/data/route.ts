import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { all, leaderboard, type Daily, type Grade } from '@/lib/database';
import { isISODate } from '@/lib/dates';
import { importedRegistry } from '@/lib/imported-registry';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (user?.role !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato.' }, { status: 403 });
  const date = request.nextUrl.searchParams.get('date') || '';
  if (!isISODate(date)) return NextResponse.json({ error: 'Data non valida.' }, { status: 400 });
  const subject = request.nextUrl.searchParams.get('subject') || '';
  if (request.nextUrl.searchParams.get('totalsOnly') === '1') {
    const rankings = await leaderboard(undefined, subject);
    return NextResponse.json({
      totals: Object.fromEntries(rankings.map(student => [student.id, student.score])),
    });
  }
  return NextResponse.json({
    lessonClasses: (await all<{class_code: string}>(
      'SELECT DISTINCT u.class_code FROM point_events e JOIN users u ON u.id=e.user_id WHERE e.date=? AND e.subject=?',
      date, subject,
    )).map(row => row.class_code),
    importedRegistry: importedRegistry(await all<{user_id: number; type: string; points: number}>(
      'SELECT user_id,type,points FROM point_events WHERE date=? AND subject=?', date, subject,
    )),
    importedPoints: Object.fromEntries(
      (await all<{ user_id: number; points: number }>(
        'SELECT user_id,SUM(points) AS points FROM point_events WHERE date=? AND subject=? GROUP BY user_id',
        date, subject,
      )).map(event => [event.user_id, Number(event.points)]),
    ),
    daily: await all<Daily>('SELECT * FROM daily WHERE date=? AND subject=?', date, subject),
    grades: await all<Grade>('SELECT * FROM grades WHERE date=? AND subject=?', date, subject),
  });
}
