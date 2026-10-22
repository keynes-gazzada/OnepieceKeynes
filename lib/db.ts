import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { GRADE_MULTIPLIERS } from './point-rules';
import {
  hashPassword,
  verifyPassword,
  sha,
  dailyPoints,
  type User,
  type Daily,
} from './registry-core';
export * from './registry-core';

let instance: DatabaseSync | null = null;
const path = resolve(
  /* turbopackIgnore: true */ process.env.DATABASE_PATH || '.data/one-piece.sqlite',
);
function db() {
  if (instance) return instance;
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path, { timeout: 5000 });
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS crews (id INTEGER PRIMARY KEY, name TEXT NOT NULL, class_code TEXT NOT NULL, flag TEXT NOT NULL DEFAULT 'skull');
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, class_code TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', crew_id INTEGER REFERENCES crews(id), roles TEXT NOT NULL DEFAULT 'Equipaggio', last_password_change TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reset_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS routes (id INTEGER PRIMARY KEY, class_code TEXT NOT NULL, year INTEGER NOT NULL, year_name TEXT NOT NULL, ordinal INTEGER NOT NULL, name TEXT NOT NULL, start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '', UNIQUE(class_code,year,ordinal));
    CREATE TABLE IF NOT EXISTS islands (id INTEGER PRIMARY KEY, route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE, name TEXT NOT NULL, topic TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS daily (id INTEGER PRIMARY KEY, date TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, subject TEXT NOT NULL DEFAULT '', presence TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', bug INTEGER NOT NULL DEFAULT 0, anxiety INTEGER NOT NULL DEFAULT 0, mystery INTEGER NOT NULL DEFAULT 0, weapon TEXT NOT NULL DEFAULT '', multiverse TEXT NOT NULL DEFAULT '', multiverse_points INTEGER NOT NULL DEFAULT 0, fruit_points INTEGER NOT NULL DEFAULT 0, imported_points_offset INTEGER NOT NULL DEFAULT 0, fruit_note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(date,user_id,subject));
    CREATE TABLE IF NOT EXISTS grades (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, type TEXT NOT NULL, grade REAL NOT NULL, points INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS point_events (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, route INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL, points REAL NOT NULL, grade REAL, source TEXT NOT NULL, source_row INTEGER NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(source,source_row));
    CREATE INDEX IF NOT EXISTS point_events_user_date ON point_events(user_id,date);
    CREATE TABLE IF NOT EXISTS dreams (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mysteries (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, revealed INTEGER NOT NULL DEFAULT 0, clues TEXT NOT NULL DEFAULT '[false,false,false,false]');
    CREATE TABLE IF NOT EXISTS imported_rows (id INTEGER PRIMARY KEY, sheet TEXT NOT NULL, data TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `);
  const dailyColumns = new Set(
    (database.prepare('PRAGMA table_info(daily)').all() as { name: string }[]).map((x) => x.name),
  );
  if (!dailyColumns.has('imported_points_offset'))
    database.exec('ALTER TABLE daily ADD COLUMN imported_points_offset INTEGER NOT NULL DEFAULT 0');
  const dreamColumns = new Set(
    (database.prepare('PRAGMA table_info(dreams)').all() as { name: string }[]).map((x) => x.name),
  );
  if (!dreamColumns.has('points'))
    database.exec(
      'ALTER TABLE dreams ADD COLUMN points INTEGER NOT NULL DEFAULT 0 CHECK(points IN (0,2,4))',
    );
  if (!dreamColumns.has('date'))
    database.exec("ALTER TABLE dreams ADD COLUMN date TEXT NOT NULL DEFAULT ''");
  if (!dreamColumns.has('subject'))
    database.exec("ALTER TABLE dreams ADD COLUMN subject TEXT NOT NULL DEFAULT ''");
  if (!dailyColumns.has('multiverse_points'))
    database.exec('ALTER TABLE daily ADD COLUMN multiverse_points INTEGER NOT NULL DEFAULT 0');
  if (!dailyColumns.has('fruit_points'))
    database.exec('ALTER TABLE daily ADD COLUMN fruit_points INTEGER NOT NULL DEFAULT 0');
  if (!dailyColumns.has('fruit_note'))
    database.exec("ALTER TABLE daily ADD COLUMN fruit_note TEXT NOT NULL DEFAULT ''");
  if (!dailyColumns.has('subject')) {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(`
        CREATE TABLE daily_by_subject (id INTEGER PRIMARY KEY, date TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, subject TEXT NOT NULL DEFAULT '', presence TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', bug INTEGER NOT NULL DEFAULT 0, anxiety INTEGER NOT NULL DEFAULT 0, mystery INTEGER NOT NULL DEFAULT 0, weapon TEXT NOT NULL DEFAULT '', multiverse TEXT NOT NULL DEFAULT '', multiverse_points INTEGER NOT NULL DEFAULT 0, fruit_points INTEGER NOT NULL DEFAULT 0, imported_points_offset INTEGER NOT NULL DEFAULT 0, fruit_note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(date,user_id,subject));
        INSERT INTO daily_by_subject(id,date,user_id,presence,phone,bug,anxiety,mystery,weapon,multiverse,multiverse_points,fruit_points,fruit_note,updated_at)
          SELECT id,date,user_id,presence,phone,bug,anxiety,mystery,weapon,multiverse,multiverse_points,fruit_points,fruit_note,updated_at FROM daily;
        DROP TABLE daily;
        ALTER TABLE daily_by_subject RENAME TO daily;
      `);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      database.close();
      throw error;
    }
  }
  for (const table of ['grades', 'point_events']) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === 'subject'))
      database.exec(`ALTER TABLE ${table} ADD COLUMN subject TEXT NOT NULL DEFAULT ''`);
  }
  instance = database;
  seed(database);
  return database;
}
function seed(d: DatabaseSync) {
  if (process.env.NODE_ENV !== 'production') {
    if ((d.prepare('SELECT COUNT(*) as n FROM crews').get() as { n: number }).n === 0) {
      for (const [name, cls, flag] of [
        ['Pirati dell’Aurora', '3CI', 'sun'],
        ['La Rotta Blu', '3CI', 'wave'],
        ['Vento di Levante', '4CI', 'wind'],
      ])
        d.prepare('INSERT INTO crews(name,class_code,flag) VALUES(?,?,?)').run(name, cls, flag);
    }
    if ((d.prepare('SELECT COUNT(*) as n FROM routes').get() as { n: number }).n === 0) {
      for (const cls of ['3CI', '4CI'])
        for (const [year, title] of [
          [1, 'Il mare delle origini'],
          [2, 'Verso la Grand Line'],
          [3, 'Il nuovo mondo'],
        ] as const)
          for (let n = 1; n <= 4; n++) {
            const name = [
              'La partenza',
              'L’arcipelago dei dati',
              'La rotta delle reti',
              'L’orizzonte digitale',
            ][n - 1];
            const schoolYear = 2023 + year;
            const start = ['09-01', '11-01', '02-01', '04-01'][n - 1];
            const end = ['10-31', '01-31', '03-31', '06-30'][n - 1];
            const startDate = `${n < 3 ? schoolYear : schoolYear + 1}-${start}`;
            const endDate = `${n === 1 ? schoolYear : schoolYear + 1}-${end}`;
            const id = Number(
              d
                .prepare(
                  'INSERT INTO routes(class_code,year,year_name,ordinal,name,start_date,end_date) VALUES(?,?,?,?,?,?,?)',
                )
                .run(cls, year, title, n, name, startDate, endDate).lastInsertRowid,
            );
            d.prepare('INSERT INTO islands(route_id,name,topic) VALUES(?,?,?)').run(
              id,
              `Isola ${n}`,
              ['Fondamenti', 'Strutture e linguaggi', 'Reti e protocolli', 'Progetti e verifica'][
                n - 1
              ],
            );
          }
    }
    if ((d.prepare('SELECT COUNT(*) as n FROM mysteries').get() as { n: number }).n === 0) {
      d.prepare('INSERT INTO mysteries(title,description,clues) VALUES(?,?,?)').run(
        'Il faro scomparso',
        'Quattro indizi conducono al segreto custodito oltre la nebbia.',
        '[true,false,false,false]',
      );
      d.prepare('INSERT INTO mysteries(title,description,clues) VALUES(?,?,?)').run(
        'La mappa delle stelle',
        'Una rotta nascosta si rivela a chi sa osservare.',
        '[false,false,false,false]',
      );
    }
  }
  d.exec(`
    UPDATE routes
    SET end_date = printf('%04d-01-31', CAST(substr(start_date, 1, 4) AS INTEGER) + 1)
    WHERE ordinal = 2
      AND substr(start_date, 6, 5) = '11-01'
      AND substr(end_date, 6, 5) = '01-31'
      AND substr(start_date, 1, 4) = substr(end_date, 1, 4)
  `);
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (
    adminEmail &&
    adminPassword &&
    !d.prepare('SELECT id FROM users WHERE email=?').get(adminEmail)
  )
    createUser(
      {
        email: adminEmail,
        password: adminPassword,
        first: 'Narratore',
        last: 'Keynes',
        classCode: '',
        role: 'admin',
      },
      d,
    );
  if (
    process.env.NODE_ENV !== 'production' &&
    !d.prepare("SELECT id FROM users WHERE email='narratore@demo.local'").get()
  ) {
    const a = createUser(
      {
        email: 'narratore@demo.local',
        password: 'Demo1234!',
        first: 'Andrea',
        last: 'Narratore',
        classCode: '',
        role: 'admin',
      },
      d,
    );
    const u = createUser(
      {
        email: 'studentessa@demo.local',
        password: 'Demo1234!',
        first: 'Nami',
        last: 'Rossi',
        classCode: '3CI',
        role: 'student',
        crewId: 1,
        roles: 'Navigatore',
      },
      d,
    );
    const v = createUser(
      {
        email: 'studente@demo.local',
        password: 'Demo1234!',
        first: 'Luca',
        last: 'Bianchi',
        classCode: '3CI',
        role: 'student',
        crewId: 1,
        roles: 'Capitano',
      },
      d,
    );
    const w = createUser(
      {
        email: 'pirata@demo.local',
        password: 'Demo1234!',
        first: 'Marta',
        last: 'Verdi',
        classCode: '3CI',
        role: 'student',
        crewId: 2,
        roles: 'Archeologo',
      },
      d,
    );
    void a;
    d.prepare('INSERT INTO dreams(user_id,text) VALUES(?,?)').run(
      u,
      'Disegnare una mappa che porti tutti più lontano.',
    );
    d.prepare('INSERT INTO dreams(user_id,text) VALUES(?,?)').run(
      v,
      'Diventare il capitano della ciurma più coraggiosa.',
    );
    d.prepare('INSERT INTO dreams(user_id,text) VALUES(?,?)').run(
      w,
      'Scoprire ciò che il mare nasconde.',
    );
    const today = new Date().toISOString().slice(0, 10);
    for (const id of [u, v, w])
      d.prepare(
        'INSERT INTO daily(date,user_id,presence,phone,bug,anxiety,mystery,weapon,multiverse) VALUES(?,?,?,?,?,?,?,?,?)',
      ).run(today, id, 'P', '+', id === u ? 1 : 0, 0, 0, '', '');
    for (const [id, grade, type] of [
      [u, 8.5, 'verifica'],
      [v, 7.5, 'progetto'],
      [w, 9, 'progetto'],
    ] as const)
      d.prepare('INSERT INTO grades(user_id,date,type,grade,points) VALUES(?,?,?,?,?)').run(
        id,
        today,
        type,
        grade,
        grade * GRADE_MULTIPLIERS[type],
      );
  }
}
export function createUser(
  input: {
    email: string;
    password: string;
    first: string;
    last: string;
    classCode: string;
    role?: 'admin' | 'student';
    crewId?: number;
    roles?: string;
  },
  d = db(),
) {
  const { salt, hash } = hashPassword(input.password);
  return Number(
    d
      .prepare(
        'INSERT INTO users(email,salt,password_hash,first_name,last_name,class_code,role,crew_id,roles) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        input.email.toLowerCase(),
        salt,
        hash,
        input.first,
        input.last,
        input.classCode,
        input.role || 'student',
        input.crewId || null,
        input.roles || 'Equipaggio',
      ).lastInsertRowid,
  );
}
export function database() {
  return db();
}
export function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return db()
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row })) as T[];
}
export function one<T>(sql: string, ...params: (string | number | null)[]): T | undefined {
  const row = db()
    .prepare(sql)
    .get(...params);
  return row ? ({ ...row } as T) : undefined;
}
export function run(sql: string, ...params: (string | number | null)[]) {
  return db()
    .prepare(sql)
    .run(...params);
}
export function userById(id: number) {
  return one<User>(
    'SELECT id,email,first_name,last_name,class_code,role,crew_id,roles,last_password_change FROM users WHERE id=?',
    id,
  );
}
export function scoreFor(userId: number) {
  const g =
    one<{ s: number }>('SELECT COALESCE(SUM(points),0) s FROM grades WHERE user_id=?', userId)?.s ||
    0;
  const imported =
    one<{ s: number }>('SELECT COALESCE(SUM(points),0) s FROM point_events WHERE user_id=?', userId)
      ?.s || 0;
  const rows = all<Daily>('SELECT * FROM daily WHERE user_id=?', userId);
  const dreams =
    one<{ s: number }>('SELECT COALESCE(SUM(points),0) s FROM dreams WHERE user_id=?', userId)?.s ||
    0;
  return g + imported + dreams + rows.reduce((s, r) => s + dailyPoints(r), 0);
}
export function leaderboard(cls?: string) {
  const users = all<User>(
    `SELECT id,email,first_name,last_name,class_code,role,crew_id,roles,last_password_change FROM users WHERE role='student' ${cls ? 'AND class_code=?' : ''}`,
    ...(cls ? [cls] : []),
  );
  return users
    .map((u) => ({ ...u, score: scoreFor(u.id) }))
    .sort((a, b) => b.score - a.score)
    .map((u, i) => ({ ...u, position: i + 1 }));
}
export function leaderboardForRange(cls: string, start: string, end: string) {
  const users = all<User>(
    "SELECT id,email,first_name,last_name,class_code,role,crew_id,roles,last_password_change FROM users WHERE role='student' AND class_code=?",
    cls,
  );
  return users
    .map((u) => {
      const grades =
        one<{ s: number }>(
          'SELECT COALESCE(SUM(points),0) s FROM grades WHERE user_id=? AND date BETWEEN ? AND ?',
          u.id,
          start,
          end,
        )?.s || 0;
      const imported =
        one<{ s: number }>(
          'SELECT COALESCE(SUM(points),0) s FROM point_events WHERE user_id=? AND date BETWEEN ? AND ?',
          u.id,
          start,
          end,
        )?.s || 0;
      const daily = all<Daily>(
        'SELECT * FROM daily WHERE user_id=? AND date BETWEEN ? AND ?',
        u.id,
        start,
        end,
      );
      return {
        ...u,
        score:
          grades +
          imported +
          (one<{ s: number }>(
            'SELECT COALESCE(SUM(points),0) s FROM dreams WHERE user_id=? AND date BETWEEN ? AND ?',
            u.id,
            start,
            end,
          )?.s || 0) +
          daily.reduce((sum, row) => sum + dailyPoints(row), 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((u, i) => ({ ...u, position: i + 1 }));
}
