export const planningFields = {
  planning: [
    ['date', 'Data', 'date'],
    ['classCode', 'Classe', 'text'],
    ['subject', 'Materia', 'text'],
    ['coTeacher', 'Codocente', 'text'],
    ['topic', 'Argomento', 'text'],
    ['notes', 'Note', 'text'],
  ],
  students: [
    ['classCode', 'Classe', 'text'],
    ['number', 'Nr.', 'text'],
    ['student', 'Alunno', 'text'],
    ['crew', 'Ciurma', 'text'],
    ['entryExit', 'Entrate/Uscite', 'text'],
    ['lessonHour', 'Ora di lezione', 'text'],
    ['entry', 'Entrata', 'time'],
    ['exit', 'Uscita', 'time'],
    ['device', 'Pc/Tablet', 'text'],
    ['certification', 'Certificazione', 'text'],
    ['printTests', 'Stampa verifiche', 'text'],
  ],
} as const;

export type PlanningKind = keyof typeof planningFields;
export type PlanningValues = Record<string, string>;
export type PlanningRow = {
  id: number;
  kind: PlanningKind;
  values: PlanningValues;
  version: string;
};
export const planningSheet = (kind: PlanningKind) => `__planning:${kind}`;
export const PLANNING_IMPORT_LOCK = 774920318;
export function isPlanningKind(value: unknown): value is PlanningKind {
  return value === 'planning' || value === 'students';
}
export function validatePlanningValues(kind: PlanningKind, value: unknown): PlanningValues | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: PlanningValues = {};
  for (const [key, , type] of planningFields[kind]) {
    if (source[key] !== undefined && typeof source[key] !== 'string') return null;
    const text = typeof source[key] === 'string' ? source[key].trim() : '';
    if (text.length > (key === 'notes' ? 2000 : 250)) return null;
    if (type === 'date' && text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    if (type === 'time' && text && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return null;
    result[key] = text;
  }
  if (kind === 'planning' && !result.date) return null;
  if (kind === 'students' && (!result.classCode || !result.student)) return null;
  if (kind === 'students' && result.lessonHour && !/^[1-8]$/.test(result.lessonHour)) return null;
  return result;
}
