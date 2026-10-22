import type { Daily } from './registry-core';
import { dailyPoints, presencePoints } from './point-rules';

// Read old subject registers as one day. The adjustment keeps their exact saved
// balance, even when attendance, phone or other flags existed in both subjects.
export function unifiedDaily(records: Daily[]): Daily[] {
  const groups = new Map<string, Daily[]>();
  for (const row of records) {
    const key = `${row.date}:${row.user_id}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const ordered = [...group].sort(
      (a, b) => a.updated_at.localeCompare(b.updated_at) || a.id - b.id,
    );
    const merged: Daily = {
      ...ordered[ordered.length - 1],
      subject: '',
      presence: group.reduce(
        (value, row) =>
          presencePoints(row.presence) < presencePoints(value) || !value ? row.presence : value,
        '',
      ),
      phone: group.some((row) => row.phone === '+') ? '+' : '',
      bug: group.reduce((sum, row) => sum + Number(row.bug), 0),
      anxiety: Number(group.some((row) => row.anxiety)),
      mystery: Number(group.some((row) => row.mystery)),
      weapon: [...new Set(ordered.flatMap((row) => row.weapon.split(', ')).filter(Boolean))].join(
        ', ',
      ),
      multiverse: ordered
        .map((row) => row.multiverse)
        .filter(Boolean)
        .join('\n'),
      multiverse_points: group.reduce((sum, row) => sum + row.multiverse_points, 0),
      fruit_points: group.reduce((sum, row) => sum + row.fruit_points, 0),
      fruit_note: ordered
        .map((row) => row.fruit_note)
        .filter(Boolean)
        .join('\n'),
      imported_points_offset: 0,
    };
    merged.imported_points_offset =
      dailyPoints(merged) - group.reduce((sum, row) => sum + dailyPoints(row), 0);
    return merged;
  });
}
