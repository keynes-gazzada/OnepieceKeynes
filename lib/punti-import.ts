import { randomBytes, scryptSync } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase } from './sql-database.ts';
type ImportDatabase = DatabaseSync | SqlDatabase;
import type { Cell, Row, Workbook, Worksheet } from 'exceljs';

const CREW_IMAGES: Record<string, string> = {
  casteddu: '/images/crews/casteddu.jpg',
  ck: '/images/crews/ck.jpeg',
  gamblers: '/images/crews/gamblers.jpg',
  ilsenato: '/images/crews/il-senato.png',
  kirk: '/images/crews/kirk.jpg',
  lapace: '/images/crews/la-pace.webp',
  lambogliafc: '/images/crews/lamboglia-fc.jpg',
  malenfc: '/images/crews/malen-fc.jpeg',
  mugiwara: '/images/crews/mugiwara.jpg',
  nhz: '/images/crews/nhz.png',
  theeves30: '/images/crews/the-eves-3-0.png',
  trm: '/images/crews/trm.jpeg',
};

const key = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const clean = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');

const titleCase = (value: string) =>
  clean(value)
    .toLocaleLowerCase('it-IT')
    .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase('it-IT'));

function cellValue(cell: Cell) {
  const raw = cell.value as unknown;
  if (raw instanceof Date) return raw;
  if (raw && typeof raw === 'object' && 'result' in raw)
    return (raw as { result?: unknown }).result ?? '';
  return raw ?? '';
}

function isoDate(cell: Cell) {
  const raw = cellValue(cell);
  if (raw instanceof Date) {
    const year = raw.getUTCFullYear();
    const month = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const day = String(raw.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const value = clean(raw);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function splitFullName(value: string) {
  const fullName = clean(value).toLocaleUpperCase('it-IT');
  const compoundSurname = ['DE LUCA', 'DEL FAVERO', 'CALDERON SEGOVIA'].find((name) =>
    fullName.startsWith(`${name} `),
  );
  const parts = fullName.split(' ');
  const last = compoundSurname || parts.shift() || fullName;
  const first = compoundSurname ? fullName.slice(compoundSurname.length + 1) : parts.join(' ');
  return { first: titleCase(first), last: titleCase(last) };
}

function placeholderEmail(classCode: string, fullName: string) {
  const slug = clean(fullName)
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return `roster.${classCode.toLocaleLowerCase('it-IT')}.${slug}@studenti.invalid`;
}

function passwordRecord() {
  const salt = randomBytes(16).toString('hex');
  const password = randomBytes(32).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

function rawRow(row: Row) {
  const values: unknown[] = [];
  for (let index = 1; index <= row.cellCount; index++) {
    const value = cellValue(row.getCell(index));
    values.push(value instanceof Date ? value.toISOString() : value);
  }
  return values;
}

function findSheet(workbook: Workbook, name: string) {
  return workbook.worksheets.find((sheet) => key(sheet.name) === key(name));
}

function crewImage(name: string) {
  return CREW_IMAGES[key(name)] || 'skull';
}

async function ensureBaseTables(database: ImportDatabase) {
  if ('dialect' in database && database.dialect === 'postgres') return;
  for (const table of ['crews', 'users', 'imported_rows']) {
    const found = await database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!found) throw new Error(`Tabella ${table} non trovata: avvia prima l'applicazione.`);
  }
}

export async function ensurePointEventsSchema(database: ImportDatabase) {
  if ('dialect' in database && database.dialect === 'postgres') return;
  await database.exec(`
    CREATE TABLE IF NOT EXISTS point_events (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      route INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      points REAL NOT NULL,
      grade REAL,
      source TEXT NOT NULL,
      source_row INTEGER NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source, source_row)
    );
    CREATE INDEX IF NOT EXISTS point_events_user_date ON point_events(user_id, date);
  `);
  const columns = (await database.prepare('PRAGMA table_info(point_events)').all()) as {
    name: string;
  }[];
  if (!columns.some((column) => column.name === 'subject'))
    await database.exec("ALTER TABLE point_events ADD COLUMN subject TEXT NOT NULL DEFAULT ''");
}

async function saveImportedRow(database: ImportDatabase, sheet: Worksheet, row: Row) {
  await database
    .prepare('INSERT INTO imported_rows(sheet,data) VALUES(?,?)')
    .run(sheet.name, JSON.stringify({ row: row.number, values: rawRow(row) }));
}

export type PuntiImportResult = {
  students: number;
  crews: number;
  events: number;
  skippedEvents: number;
};

export async function importPuntiWorkbook(
  database: ImportDatabase,
  workbook: Workbook,
  source = 'Punti.xlsx',
  removeDemoData = false,
): Promise<PuntiImportResult> {
  await ensureBaseTables(database);
  await ensurePointEventsSchema(database);

  const studentsSheet = findSheet(workbook, 'Studenti');
  const pointsSheet = findSheet(workbook, 'One Piece');
  if (!studentsSheet && !pointsSheet)
    throw new Error('Il file non contiene i fogli Studenti o One Piece.');

  const result: PuntiImportResult = { students: 0, crews: 0, events: 0, skippedEvents: 0 };
  const usersByRosterName = new Map<string, number>();
  const importedCrewIds = new Set<number>();

  const perform = async () => {
    if (removeDemoData) {
      await database
        .prepare(
          "DELETE FROM users WHERE email IN ('studentessa@demo.local','studente@demo.local','pirata@demo.local')",
        )
        .run();
      await database
        .prepare(
          "DELETE FROM crews WHERE name IN ('Pirati dell’Aurora','La Rotta Blu','Vento di Levante') AND NOT EXISTS (SELECT 1 FROM users WHERE users.crew_id=crews.id)",
        )
        .run();
    }

    if (studentsSheet) {
      await database.prepare('DELETE FROM imported_rows WHERE sheet=?').run(studentsSheet.name);
      for (let rowNumber = 2; rowNumber <= studentsSheet.rowCount; rowNumber++) {
        const row = studentsSheet.getRow(rowNumber);
        const classCode = clean(cellValue(row.getCell(1))).toLocaleUpperCase('it-IT');
        const fullName = clean(cellValue(row.getCell(3)));
        const crewName = clean(cellValue(row.getCell(4)));
        if (!classCode || !fullName || !crewName) continue;

        let crew = (await database
          .prepare('SELECT id FROM crews WHERE class_code=? AND name=? COLLATE NOCASE')
          .get(classCode, crewName)) as { id: number } | undefined;
        if (!crew) {
          const inserted = await database
            .prepare('INSERT INTO crews(name,class_code,flag) VALUES(?,?,?)')
            .run(crewName, classCode, crewImage(crewName));
          crew = { id: Number(inserted.lastInsertRowid) };
        } else {
          await database
            .prepare('UPDATE crews SET name=?,flag=? WHERE id=?')
            .run(crewName, crewImage(crewName), crew.id);
        }
        importedCrewIds.add(crew.id);

        const { first, last } = splitFullName(fullName);
        const existingUsers = (await database
          .prepare(
            "SELECT id,first_name,last_name FROM users WHERE role='student' AND class_code=?",
          )
          .all(classCode)) as { id: number; first_name: string; last_name: string }[];
        const user = existingUsers.find(
          (candidate) => key(`${candidate.last_name} ${candidate.first_name}`) === key(fullName),
        );
        let userId: number;
        if (user) {
          userId = user.id;
          await database.prepare('UPDATE users SET crew_id=? WHERE id=?').run(crew.id, userId);
        } else {
          const password = passwordRecord();
          const inserted = await database
            .prepare(
              'INSERT INTO users(email,salt,password_hash,first_name,last_name,class_code,role,crew_id,roles) VALUES(?,?,?,?,?,?,?,?,?)',
            )
            .run(
              placeholderEmail(classCode, fullName),
              password.salt,
              password.hash,
              first,
              last,
              classCode,
              'student',
              crew.id,
              'Equipaggio',
            );
          userId = Number(inserted.lastInsertRowid);
        }
        usersByRosterName.set(`${classCode}|${key(fullName)}`, userId);
        await saveImportedRow(database, studentsSheet, row);
        result.students++;
      }
    }

    result.crews = importedCrewIds.size;

    if (pointsSheet) {
      await database.prepare('DELETE FROM point_events WHERE source=?').run(source);
      await database.prepare('DELETE FROM imported_rows WHERE sheet=?').run(pointsSheet.name);
      for (let rowNumber = 2; rowNumber <= pointsSheet.rowCount; rowNumber++) {
        const row = pointsSheet.getRow(rowNumber);
        const date = isoDate(row.getCell(1));
        const classCode = clean(cellValue(row.getCell(3))).toLocaleUpperCase('it-IT');
        const fullName = clean(cellValue(row.getCell(4)));
        const type = clean(cellValue(row.getCell(5)));
        if (!date && !classCode && !fullName && !type) continue;
        const points = Number(cellValue(row.getCell(6)));
        await saveImportedRow(database, pointsSheet, row);
        if (!date || !classCode || !fullName || !type || !Number.isFinite(points)) {
          result.skippedEvents++;
          continue;
        }

        let userId = await usersByRosterName.get(`${classCode}|${key(fullName)}`);
        if (!userId) {
          const users = (await database
            .prepare(
              "SELECT id,first_name,last_name FROM users WHERE role='student' AND class_code=?",
            )
            .all(classCode)) as { id: number; first_name: string; last_name: string }[];
          userId = users.find(
            (candidate) => key(`${candidate.last_name} ${candidate.first_name}`) === key(fullName),
          )?.id;
        }
        if (!userId) {
          result.skippedEvents++;
          continue;
        }

        const route = Number(cellValue(row.getCell(2))) || 0;
        const gradeValue = cellValue(row.getCell(7));
        const grade = gradeValue === '' ? null : Number(gradeValue);
        await database
          .prepare(
            'INSERT INTO point_events(user_id,date,route,type,points,grade,source,source_row) VALUES(?,?,?,?,?,?,?,?)',
          )
          .run(
            userId,
            date,
            route,
            type,
            points,
            grade !== null && Number.isFinite(grade) ? grade : null,
            source,
            rowNumber,
          );
        result.events++;
      }
    }

    return result;
  };
  if ('transaction' in database) return database.transaction(perform);
  database.exec('BEGIN');
  try {
    const result = await perform();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    await database.exec('ROLLBACK');
    throw error;
  }
}
