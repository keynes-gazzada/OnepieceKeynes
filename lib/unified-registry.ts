import type { Daily } from './registry-core';
import { dailyPoints, presencePoints, POINT_RULES, type PointRules } from './point-rules';

// Read old subject registers as one day. The adjustment keeps their exact saved
// balance, even when attendance, phone or other flags existed in both subjects.
export function unifiedDaily(records: Daily[], rules: PointRules = POINT_RULES): Daily[] {
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
          presencePoints(row.presence, rules) < presencePoints(value, rules) || !value
            ? row.presence
            : value,
        '',
      ),
      phone: group.some((row) => row.phone === '+') ? '+' : '',
      bug: group.reduce((sum, row) => sum + Number(row.bug), 0),
      anxiety: group.reduce((sum, row) => sum + Number(row.anxiety), 0),
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
      dailyPoints(merged, rules) - group.reduce((sum, row) => sum + dailyPoints(row, rules), 0);
    return merged;
  });
}
