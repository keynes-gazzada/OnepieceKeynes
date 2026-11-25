import type { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase } from './sql-database.ts';
import { importKey, type StudentImportRow } from './planning-import.ts';

type ImportDatabase = DatabaseSync | SqlDatabase;
export type GraduatingStudent = {
  id: number;
  first_name: string;
  last_name: string;
  class_code: string;
};

export async function graduatingStudents(database: ImportDatabase, rows: StudentImportRow[]) {
  const names = new Set(rows.map((row) => importKey(row.values.student)));
  const users = (await database
    .prepare(
      "SELECT id,first_name,last_name,class_code FROM users WHERE role='student' ORDER BY class_code,last_name,first_name",
    )
    .all()) as GraduatingStudent[];
  return users
    .filter(
      (user) =>
        /^5(?:\D|$)/.test(user.class_code.trim()) &&
        !names.has(importKey(`${user.last_name} ${user.first_name}`)),
    )
    .map((user) => ({ ...user, id: Number(user.id) }));
}

export async function removeGraduatingStudents(
  database: ImportDatabase,
  students: GraduatingStudent[],
) {
  if (!students.length) return;
  const allStudents = (await database
    .prepare("SELECT id,first_name,last_name FROM users WHERE role='student'")
    .all()) as { id: number; first_name: string; last_name: string }[];
  const removedIds = new Set(students.map((student) => student.id));
  for (const student of students) {
    const name = importKey(`${student.last_name} ${student.first_name}`);
    if (
      allStudents.some(
        (other) =>
          !removedIds.has(Number(other.id)) &&
          importKey(`${other.last_name} ${other.first_name}`) === name,
      )
    )
      throw new Error(
        'Studenti: un nome da rimuovere è condiviso con un altro studente; verifica prima le rispettive identità.',
      );
  }
  const archived = (await database.prepare('SELECT id,sheet,data FROM imported_rows').all()) as {
    id: number;
    sheet: string;
    data: string;
  }[];
  const records = archived.flatMap((row) => {
    try {
      const value: unknown = JSON.parse(row.data);
      return value && typeof value === 'object'
        ? [{ ...row, record: value as Record<string, unknown> }]
        : [];
    } catch {
      return [];
    }
  });
  for (const student of students) {
    const name = importKey(`${student.last_name} ${student.first_name}`);
    const grades = (await database
      .prepare('SELECT id FROM grades WHERE user_id=?')
      .all(student.id)) as { id: number }[];
    for (const grade of grades)
      await database
        .prepare('DELETE FROM imported_rows WHERE sheet=?')
        .run(`__weapon:grade:${grade.id}`);
    for (const row of records) {
      const record = row.record;
      if (row.sheet === '__planning:students') {
        if (
          String(record._studentId || '') === String(student.id) ||
          importKey(record.student) === name
        )
          await database.prepare('DELETE FROM imported_rows WHERE id=?').run(Number(row.id));
        continue;
      }
      if (row.sheet.startsWith('__')) continue;
      const cells = Array.isArray(record.values) ? record.values : Object.values(record);
      const normalized = cells
        .filter((cell) => ['string', 'number'].includes(typeof cell))
        .map(importKey);
      if (normalized.includes(name))
        await database.prepare('DELETE FROM imported_rows WHERE id=?').run(Number(row.id));
    }
    await database.prepare("DELETE FROM users WHERE id=? AND role='student'").run(student.id);
  }
}
