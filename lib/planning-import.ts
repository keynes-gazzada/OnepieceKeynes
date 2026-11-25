import type { Cell, Worksheet } from 'exceljs';
import type { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase } from './sql-database.ts';
import { isISODate } from './dates.ts';
import { planningSheet, validatePlanningValues, type PlanningValues } from './planning.ts';

type ImportDatabase = DatabaseSync | SqlDatabase;
export type StudentImportRow = { row: number; values: PlanningValues };

export function importKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function value(cell: Cell): unknown {
  const raw = cell.value;
  if (raw && typeof raw === 'object' && !(raw instanceof Date) && 'result' in raw)
    return raw.result ?? '';
  if (raw && typeof raw === 'object' && !(raw instanceof Date) && 'richText' in raw)
    return cell.text;
  return raw ?? '';
}
function text(cell: Cell) {
  const raw = value(cell);
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw ?? '').trim();
}
function time(cell: Cell) {
  const raw = value(cell);
  if (raw === '') return '';
  if (raw instanceof Date) return raw.toISOString().slice(11, 16);
  if (typeof raw === 'number' && raw >= 0 && raw < 1) {
    const minutes = Math.round(raw * 1440);
    if (minutes >= 1440) return '';
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(raw).trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : String(raw).trim();
}
function columns(sheet: Worksheet) {
  const result = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => {
    const name = importKey(cell.text);
    if (name && !result.has(name)) result.set(name, column);
  });
  return (...names: string[]) =>
    names.map((name) => result.get(importKey(name))).find(Boolean) || 0;
}
function rows(sheet: Worksheet, callback: (rowNumber: number) => void) {
  let count = 0;
  sheet.eachRow((row, index) => {
    if (index === 1 || !row.hasValues) return;
    count++;
    if (count > 5000) throw new Error(`Il foglio ${sheet.name} supera 5000 righe.`);
    callback(index);
  });
}
export function parsePlanningSheet(sheet: Worksheet): PlanningValues[] {
  const col = columns(sheet);
  const fields = {
    date: col('Data'),
    classCode: col('Classe'),
    subject: col('Disciplina', 'Materia'),
    coTeacher: col('Codocente'),
    topic: col('Argomento'),
    notes: col('Note'),
  };
  if (
    !fields.date ||
    !fields.classCode ||
    !fields.subject ||
    !fields.coTeacher ||
    !fields.topic ||
    !fields.notes
  )
    throw new Error(
      'Il foglio Planning deve contenere Data, Classe, Disciplina, Codocente, Argomento e Note.',
    );
  const result: PlanningValues[] = [];
  rows(sheet, (index) => {
    const row = sheet.getRow(index);
    const rawDate = value(row.getCell(fields.date));
    let date =
      rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate ?? '').trim();
    const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
    if (italian)
      date = `${italian[3]}-${italian[2].padStart(2, '0')}-${italian[1].padStart(2, '0')}`;
    const values = {
      date,
      classCode: text(row.getCell(fields.classCode)).toLocaleUpperCase('it-IT'),
      subject: text(row.getCell(fields.subject)),
      coTeacher: text(row.getCell(fields.coTeacher)),
      topic: text(row.getCell(fields.topic)),
      notes: text(row.getCell(fields.notes)),
    };
    if (Object.values(values).every((entry) => !entry)) return;
    const valid = validatePlanningValues('planning', values);
    if (!valid || !isISODate(valid.date))
      throw new Error(`Planning, riga ${index}: controlla la data.`);
    result.push(valid);
  });
  return result;
}
export function parseStudentsSheet(sheet: Worksheet): StudentImportRow[] {
  const col = columns(sheet);
  const fields = {
    classCode: col('Classe'),
    number: col('Nr.', 'Numero'),
    student: col('Alunno/a', 'Alunno', 'Studente'),
    crew: col('Ciurma'),
    entryExit: col('Entrate/Uscite'),
    lessonHour: col('Ora di lezione'),
    entry: col('Entrata'),
    exit: col('Uscita'),
    device: col('Pc/Tablet'),
    certification: col('Certificazione'),
    printTests: col('Stampa verifiche'),
  };
  if (!fields.classCode || !fields.student || !fields.crew)
    throw new Error('Il foglio Studenti deve contenere Classe, Alunno/a e Ciurma.');
  const result: StudentImportRow[] = [];
  const seen = new Set<string>();
  rows(sheet, (index) => {
    const row = sheet.getRow(index);
    const get = (column: number) => (column ? text(row.getCell(column)) : '');
    const combined = get(fields.entryExit);
    const match = /^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/.exec(combined);
    const pad = (entry: string) => entry.replace(/^(\d):/, '0$1:');
    const lesson = get(fields.lessonHour);
    const lessonMatch = /^(?:ora\s*)?([1-8])\s*(?:[ª°a]\s*)?(?:ora)?$/i.exec(lesson);
    const values = {
      classCode: get(fields.classCode).toLocaleUpperCase('it-IT'),
      number: get(fields.number),
      student: get(fields.student).replace(/\s+/g, ' '),
      crew: get(fields.crew),
      entry: (fields.entry ? time(row.getCell(fields.entry)) : '') || (match ? pad(match[1]) : ''),
      exit: (fields.exit ? time(row.getCell(fields.exit)) : '') || (match ? pad(match[2]) : ''),
      entryExit: combined,
      lessonHour: lessonMatch ? lessonMatch[1] : lesson,
      device: get(fields.device),
      certification: get(fields.certification),
      printTests: get(fields.printTests),
    };
    if (Object.values(values).every((entry) => !entry)) return;
    const valid = validatePlanningValues('students', values);
    if (!valid) throw new Error(`Studenti, riga ${index}: controlla classe, alunno e orari.`);
    const identity = `${importKey(valid.classCode)}|${importKey(valid.student)}`;
    if (seen.has(identity))
      throw new Error(`Studenti, riga ${index}: studente duplicato nella stessa classe.`);
    seen.add(identity);
    result.push({ row: index, values: valid });
  });
  return result;
}
export async function appendPlanningRows(database: ImportDatabase, entries: PlanningValues[]) {
  for (const entry of entries)
    await database
      .prepare('INSERT INTO imported_rows(sheet,data) VALUES(?,?)')
      .run(planningSheet('planning'), JSON.stringify(entry));
}
export async function createPlanningStudentSync(database: ImportDatabase) {
  const stored = (await database
    .prepare('SELECT id,data FROM imported_rows WHERE sheet=? ORDER BY id')
    .all(planningSheet('students'))) as { id: number; data: string }[];
  const records = stored.map((row) => ({
    id: Number(row.id),
    raw: row.data,
    values: JSON.parse(row.data) as PlanningValues,
  }));
  return async (userId: number, values: PlanningValues) => {
    const linked = records.filter((row) => row.values._studentId === String(userId));
    const unlinked = records.filter(
      (row) =>
        !row.values._studentId &&
        importKey(row.values.classCode) === importKey(values.classCode) &&
        importKey(row.values.student) === importKey(values.student),
    );
    if (linked.length > 1 || unlinked.length > 1 || (linked.length > 0 && unlinked.length > 0))
      throw new Error(
        `Studenti: più righe Planning corrispondono a ${values.student}, ${values.classCode}.`,
      );
    const current = linked[0] || unlinked[0];
    const merged: PlanningValues = {
      ...(current?.values || {}),
      ...Object.fromEntries(
        Object.entries(values).filter(
          ([name, entry]) => ['classCode', 'student'].includes(name) || entry !== '',
        ),
      ),
      _studentId: String(userId),
    };
    if (values.entryExit && !['entrata', 'uscita'].includes(importKey(values.entryExit))) {
      merged.entry = values.entry;
      merged.exit = values.exit;
    }
    if (current) {
      const raw = JSON.stringify(merged);
      const updated = await database
        .prepare('UPDATE imported_rows SET data=? WHERE id=? AND sheet=? AND data=?')
        .run(raw, current.id, planningSheet('students'), current.raw);
      if (!updated.changes)
        throw new Error(
          'Studenti: una scheda Planning è cambiata durante l’importazione. Ricarica e riprova.',
        );
      current.values = merged;
      current.raw = raw;
    } else {
      const inserted = await database
        .prepare('INSERT INTO imported_rows(sheet,data) VALUES(?,?)')
        .run(planningSheet('students'), JSON.stringify(merged));
      records.push({
        id: Number(inserted.lastInsertRowid),
        raw: JSON.stringify(merged),
        values: merged,
      });
    }
  };
}
