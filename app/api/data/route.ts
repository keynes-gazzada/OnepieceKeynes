import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { all, one, dailyPoints, leaderboard, type Daily, type Grade } from '@/lib/database';
import { isISODate } from '@/lib/dates';
import { importedRegistry } from '@/lib/imported-registry';
import { unifiedDaily } from '@/lib/unified-registry';
import { belongsToLesson, registrySubject } from '@/lib/registry-lessons';
import { scoringSettings } from '@/lib/scoring-settings';
import { studentPoints } from '@/lib/student-points';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const user = await currentUser();
  const studentId = Number(request.nextUrl.searchParams.get('student'));
  if (request.nextUrl.searchParams.has('student')) {
    if (!user || (user.role !== 'admin' && user.id !== studentId))
      return NextResponse.json({ error: 'Accesso riservato.' }, { status: 403 });
    if (!Number.isSafeInteger(studentId) || studentId <= 0)
      return NextResponse.json({ error: 'Studente non valido.' }, { status: 400 });
    if (!(await one("SELECT id FROM users WHERE id=? AND role='student'", studentId)))
      return NextResponse.json({ error: 'Studente non trovato.' }, { status: 404 });
    return NextResponse.json(await studentPoints(studentId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  if (user?.role !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato.' }, { status: 403 });
  const date = request.nextUrl.searchParams.get('date') || '';
  if (!isISODate(date)) return NextResponse.json({ error: 'Data non valida.' }, { status: 400 });
  if (request.nextUrl.searchParams.get('totalsOnly') === '1') {
    const rankings = await leaderboard();
    return NextResponse.json({
      totals: Object.fromEntries(rankings.map((student) => [student.id, student.score])),
    });
  }
  const subject = registrySubject(request.nextUrl.searchParams.get('subject'));
  if (subject === null) return NextResponse.json({ error: 'Materia non valida.' }, { status: 400 });
  const daily = await all<Daily>('SELECT * FROM daily WHERE date=?', date);
  const { daily: rules } = await scoringSettings();
  const otherDailyPoints: Record<number, number> = {};
  for (const row of daily) {
    if (!belongsToLesson(row.subject, subject))
      otherDailyPoints[row.user_id] =
        (otherDailyPoints[row.user_id] || 0) + dailyPoints(row, rules);
  }
  return NextResponse.json({
    otherDailyPoints,
    lessonClasses: (
      await all<{ class_code: string }>(
        'SELECT DISTINCT u.class_code FROM point_events e JOIN users u ON u.id=e.user_id WHERE e.date=?',
        date,
      )
    ).map((row) => row.class_code),
    importedRegistry:
      subject === ''
        ? importedRegistry(
            await all<{ user_id: number; type: string; points: number }>(
              'SELECT user_id,type,points FROM point_events WHERE date=?',
              date,
            ),
          )
        : {},
    importedPoints: Object.fromEntries(
      (
        await all<{ user_id: number; points: number }>(
          'SELECT user_id,SUM(points) AS points FROM point_events WHERE date=? GROUP BY user_id',
          date,
        )
      ).map((event) => [event.user_id, Number(event.points)]),
    ),
    clueCounts: Object.fromEntries(
      (
        await all<{ user_id: number; count: number }>(
          "SELECT user_id,COUNT(*) AS count FROM point_events WHERE date=? AND source LIKE 'clue:%' GROUP BY user_id",
          date,
        )
      ).map((entry) => [entry.user_id, Number(entry.count)]),
    ),
    daily: unifiedDaily(
      daily.filter((row) => belongsToLesson(row.subject, subject)),
      rules,
    ).map((row) => ({ ...row, subject })),
    grades: await all<Grade>('SELECT * FROM grades WHERE date=?', date),
  });
}
