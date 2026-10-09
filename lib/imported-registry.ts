import { dailyPoints, POINT_RULES } from './point-rules';

export function importedRegistry(events: { user_id: number; type: string; points: number }[]) {
  const result: Record<
    number,
    {
      presence: string;
      phone: string;
      bug: boolean;
      anxiety: boolean;
      mystery: boolean;
      multiverse: string;
      multiverse_points: number;
      fruit_points: number;
      imported_points_offset: number;
    }
  > = {};
  for (const event of events) {
    const kind = event.type.trim().toLocaleLowerCase('it-IT').replace(/\s+/g, '');
    if (
      ![
        'presenza',
        'assenza',
        'assenza+',
        'telefono',
        'bug',
        'ansia',
        'mistero',
        'multiverso',
      ].includes(kind)
    )
      continue;
    const row = (result[event.user_id] ||= {
      presence: 'P',
      phone: '',
      bug: false,
      anxiety: false,
      mystery: false,
      multiverse: '',
      multiverse_points: 0,
      fruit_points: 0,
      imported_points_offset: 0,
    });
    if (kind === 'presenza' && !row.presence) row.presence = 'P';
    if (kind === 'assenza+' || (kind === 'assenza' && Number(event.points) === -80))
      row.presence = 'A+';
    else if (kind === 'assenza' && row.presence !== 'A+') row.presence = 'A';
    if (kind === 'telefono') row.phone = '+';
    if (kind === 'bug') row.bug = true;
    if (kind === 'ansia') row.anxiety = true;
    if (kind === 'mistero') row.mystery = true;
    if (kind === 'multiverso') {
      row.multiverse = 'Importato da Excel';
      row.multiverse_points = POINT_RULES.multiverse;
    }
  }
  // Imported events remain the source of their exact historical amounts. The hydrated
  // controls add only subsequent changes, rather than awarding the same activity again.
  for (const row of Object.values(result)) row.imported_points_offset = dailyPoints(row);
  return result;
}
