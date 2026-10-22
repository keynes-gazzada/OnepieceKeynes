export const POINT_RULES = {
  absence: -40,
  absencePlus: -80,
  phone: 30,
  bug: 50,
  anxiety: -30,
  mystery: 2000,
  multiverse: 80,
} as const;
export const GRADE_MULTIPLIERS = { verifica: 200, progetto: 100 } as const;
export function presencePoints(value: string) {
  return value === 'A' ? POINT_RULES.absence : value === 'A+' ? POINT_RULES.absencePlus : 0;
}
export function phonePoints(value: string) {
  return value === '+' ? POINT_RULES.phone : 0;
}
export function dailyPoints(row: {
  presence: string;
  phone: string;
  bug: boolean | number;
  anxiety: boolean | number;
  mystery: boolean | number;
  multiverse_points: number;
  fruit_points: number;
  imported_points_offset?: number;
}) {
  return (
    presencePoints(row.presence) +
    phonePoints(row.phone) +
    Number(row.bug) * POINT_RULES.bug +
    (row.anxiety ? POINT_RULES.anxiety : 0) +
    (row.mystery ? POINT_RULES.mystery : 0) +
    row.multiverse_points +
    row.fruit_points -
    (row.imported_points_offset || 0)
  );
}
