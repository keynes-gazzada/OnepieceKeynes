import 'server-only';
import { one, run } from './database';
import { DEFAULT_SCORING, type ScoringSettings } from './point-rules';

// The existing JSON archive stores versioned settings in both SQLite and PostgreSQL.
const SETTINGS_SHEET = '__settings:point-rules';
export function validScoring(value: unknown): value is ScoringSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as ScoringSettings;
  return (['daily', 'grades'] as const).every(
    (group) =>
      settings[group] &&
      Object.keys(DEFAULT_SCORING[group]).every((key) => {
        const n = (settings[group] as Record<string, unknown>)[key];
        return (
          typeof n === 'number' &&
          Number.isSafeInteger(n) &&
          Math.abs(n) <= 100000 &&
          (!(group === 'grades' || key === 'multiverse') || n > 0)
        );
      }),
  );
}
export async function scoringSettings(): Promise<ScoringSettings> {
  const row = await one<{ data: string }>(
    'SELECT data FROM imported_rows WHERE sheet=? ORDER BY id DESC LIMIT 1',
    SETTINGS_SHEET,
  );
  if (!row) return DEFAULT_SCORING;
  const value: unknown = JSON.parse(row.data);
  if (!validScoring(value)) throw new Error('Configurazione dei punteggi non valida.');
  return value;
}
export async function saveScoringSettings(settings: ScoringSettings) {
  await run(
    'INSERT INTO imported_rows(sheet,data) VALUES(?,?)',
    SETTINGS_SHEET,
    JSON.stringify(settings),
  );
}
