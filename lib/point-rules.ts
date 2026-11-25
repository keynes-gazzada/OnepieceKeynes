export const POINT_RULES = {
  absence: -40,
  absencePlus: -80,
  phone: 30,
  bug: 50,
  anxiety: -30,
  mystery: 2000,
  multiverse: 80,
} as const;
export type PointRules = { [K in keyof typeof POINT_RULES]: number };
export const GRADE_MULTIPLIERS = { verifica: 200, progetto: 100 } as const;
export type ScoringSettings = { daily: PointRules; grades: { verifica: number; progetto: number } };
export const DEFAULT_SCORING: ScoringSettings = { daily: POINT_RULES, grades: GRADE_MULTIPLIERS };
export function presencePoints(value: string, rules: PointRules = POINT_RULES) {
  return value === 'A' ? rules.absence : value === 'A+' ? rules.absencePlus : 0;
}
export function phonePoints(value: string, rules: PointRules = POINT_RULES) {
  return value === '+' ? rules.phone : 0;
}
export function dailyPoints(
  row: {
    presence: string;
    phone: string;
    bug: boolean | number;
    anxiety: boolean | number;
    mystery: boolean | number;
    multiverse_points: number;
    fruit_points: number;
    imported_points_offset?: number;
  },
  rules: PointRules = POINT_RULES,
) {
  return (
    presencePoints(row.presence, rules) +
    phonePoints(row.phone, rules) +
    Number(row.bug) * rules.bug +
    Number(row.anxiety) * rules.anxiety +
    (row.mystery ? rules.mystery : 0) +
    row.multiverse_points +
    row.fruit_points -
    (row.imported_points_offset || 0)
  );
}
