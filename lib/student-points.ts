import { all, type Daily, type Grade, type PointEvent } from './database';
import { scoringSettings } from './scoring-settings';

export type PointMovement = {
  id: string;
  date: string;
  description: string;
  points: number;
  editableDescription?: string;
  multiverse?: boolean;
  clue?: boolean;
};
export async function studentPoints(userId: number) {
  const [daily, grades, events, legacy, settings, weapons, descriptions] = await Promise.all([
    all<Daily>('SELECT * FROM daily WHERE user_id=? ORDER BY date DESC,id DESC', userId),
    all<Grade>('SELECT * FROM grades WHERE user_id=? ORDER BY date DESC,id DESC', userId),
    all<PointEvent>(
      'SELECT * FROM point_events WHERE user_id=? ORDER BY date DESC,id DESC',
      userId,
    ),
    all<{ id: number; date: string; points: number }>(
      'SELECT id,date,points FROM dreams WHERE user_id=? AND points<>0',
      userId,
    ),
    scoringSettings(),
    all<{ sheet: string; data: string }>(
      'SELECT sheet,data FROM imported_rows WHERE sheet LIKE ?',
      '__weapon:grade:%',
    ),
    all<{ sheet: string; data: string }>('SELECT sheet,data FROM imported_rows WHERE sheet LIKE ?', '__grade:description:%'),
  ]);
  const linked = new Map<string, string>();
  for (const row of weapons) {
    try {
      const value = JSON.parse(row.data);
      if (value.weapon === 'Pluton' && value.user_id === userId)
        linked.set(row.sheet.slice('__weapon:grade:'.length), value.weapon);
    } catch {
      /* Ignore malformed historical records. */
    }
  }
  for (const grade of grades)
    grade.weapon = linked.get(String(grade.id)) === 'Pluton' ? 'Pluton' : '';
  for (const row of descriptions) {
    try {
      const grade = grades.find((item) => String(item.id) === row.sheet.slice('__grade:description:'.length));
      if (grade) grade.description = JSON.parse(row.data).description;
    } catch { /* Ignore malformed historical records. */ }
  }
  const movements: PointMovement[] = [
    ...grades.map((g) => ({
      id: `g${g.id}`,
      date: g.date,
      description: `${g.type} · voto ${g.grade}${g.description ? ` · ${g.description}` : ''}${g.weapon ? ' · Pluton ×2' : ''}`,
      points: g.points,
    })),
    ...events.map((e) => ({
      id: `e${e.id}`,
      date: e.date,
      description: `${e.type}${e.grade !== null ? ` · voto ${e.grade}` : ''}`,
      editableDescription: e.type,
      multiverse: e.source.startsWith('multiverse:'),
      clue: e.source.startsWith('clue:'),
      points: e.points,
    })),
    ...legacy.map((e) => ({
      id: `s${e.id}`,
      date: e.date,
      description: 'Punti storici',
      points: e.points,
    })),
  ];
  for (const row of daily) {
    const r = settings.daily;
    const items: [string, number][] = [
      [
        `Presenza ${row.presence || '—'}`,
        row.presence === 'A' ? r.absence : row.presence === 'A+' ? r.absencePlus : 0,
      ],
      ['Telefono', row.phone === '+' ? r.phone : 0],
      [`Bug × ${row.bug}`, row.bug * r.bug],
      [`Ansia × ${row.anxiety}`, row.anxiety * r.anxiety],
      ['Mistero', row.mystery ? r.mystery : 0],
      [row.multiverse ? `Multiverso · ${row.multiverse}` : 'Multiverso', row.multiverse_points],
      [row.fruit_note ? `Frutti · ${row.fruit_note}` : 'Frutti', row.fruit_points],
      ['Rettifica importazione', -(row.imported_points_offset || 0)],
    ];
    items.forEach(([description, points], index) => {
      if (points)
        movements.push({
          id: `d${row.id}:${index}`,
          date: row.date,
          description: `${row.subject || 'Registro storico'} · ${description}`,
          points,
        });
    });
  }
  movements.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return {
    movements,
    grades,
    total: movements.reduce((sum, movement) => sum + movement.points, 0),
  };
}
