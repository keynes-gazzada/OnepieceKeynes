import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';
import { removeGraduatingStudents } from '../lib/annual-roster';
import { parseStudentsSheet } from '../lib/planning-import';

const admin = { email: 'narratore@demo.local', password: 'Demo1234!' };
async function workbook(students: unknown[][], lessons: unknown[][] = []) {
  const book = new ExcelJS.Workbook();
  book
    .addWorksheet('Planning')
    .addRows([['Data', 'Classe', 'Disciplina', 'Codocente', 'Argomento', 'Note'], ...lessons]);
  book
    .addWorksheet('Studenti')
    .addRows([
      [
        'Classe',
        'Nr.',
        'Alunno/a',
        'Ciurma',
        'Entrate/Uscite',
        'Pc/Tablet',
        'Certificazione',
        'Stampa Verifiche',
      ],
      ...students,
    ]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
const file = (buffer: Buffer) => ({
  name: 'Template.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer,
});

test('Excel lesson hours and time values are read without discarding the original field', () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Studenti');
  sheet.addRows([
    [
      'Classe',
      'Nr.',
      'Alunno/a',
      'Ciurma',
      'Entrate/Uscite',
      'Ora di lezione',
      'Entrata',
      'Uscita',
    ],
    ['3OR', 1, 'TEST ORARIO', 'Ciurma', 'Entrata', '2ª ora', 535 / 1440, ''],
    ['3OR', 2, 'TEST INTERVALLO', 'Ciurma', '8:55 - 13:05', '', '', ''],
    ['3OR', 3, 'TEST NOTA', 'Ciurma', 'Secondo accordi', '', '', ''],
  ]);
  const rows = parseStudentsSheet(sheet);
  expect(rows[0].values).toMatchObject({ entryExit: 'Entrata', lessonHour: '2', entry: '08:55' });
  expect(rows[1].values).toMatchObject({
    entryExit: '8:55 - 13:05',
    entry: '08:55',
    exit: '13:05',
  });
  expect(rows[2].values).toMatchObject({ entryExit: 'Secondo accordi', entry: '', exit: '' });
});

test('the supplied template structure imports both sheets and synchronizes the roster without duplicates', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', { data: admin });
  const buffer = await workbook(
    [['4ZX', 13, 'PROVA PLANNING', 'Ciurma Test', 'Entrata', 'Tablet', 'Cert A', 'Sì']],
    [[new Date('2026-09-14T00:00:00Z'), '4ZX', 'SeR', '', 'Presentazione', '']],
  );
  const importFile = () =>
    page.request.post('/api/planning', { multipart: { kind: 'workbook', file: file(buffer) } });
  const first = await importFile();
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({ counts: { Planning: 1, Studenti: 1, Ciurme: 1 } });
  let data = await (await page.request.get('/api/planning')).json();
  const student = data.students.find(
    (row: { values: { student: string } }) => row.values.student === 'PROVA PLANNING',
  );
  expect(student.values).toMatchObject({
    classCode: '4ZX',
    number: '13',
    crew: 'Ciurma Test',
    entryExit: 'Entrata',
    device: 'Tablet',
    certification: 'Cert A',
    printTests: 'Sì',
  });
  const studentId = Number(student.values._studentId);
  expect(studentId).toBeGreaterThan(0);
  expect(
    data.planning.some(
      (row: { values: { date: string; subject: string } }) =>
        row.values.date === '2026-09-14' && row.values.subject === 'SeR',
    ),
  ).toBeTruthy();
  expect(
    (
      await page.request.post('/api/auth/registration-student', {
        data: { email: 's-prova.planning@isiskeynes.it' },
      })
    ).status(),
  ).toBe(200);
  const updated = {
    ...student.values,
    entryExit: 'Entrata',
    lessonHour: '2',
    entry: '08:55',
    device: 'Computer personale',
  };
  expect(
    (
      await page.request.post('/api/planning', {
        data: {
          kind: 'students',
          action: 'update',
          id: student.id,
          expected: student.version,
          values: updated,
        },
      })
    ).status(),
  ).toBe(200);
  const stale = await page.request.post('/api/planning', {
    data: {
      kind: 'students',
      action: 'update',
      id: student.id,
      expected: student.version,
      values: { ...updated, device: 'Dato obsoleto' },
    },
  });
  expect(stale.status()).toBe(409);
  const duplicate = await page.request.post('/api/planning', {
    data: { kind: 'students', action: 'create', values: student.values },
  });
  expect(duplicate.status()).toBe(409);
  const emptyExtra = await workbook([['4ZX', 13, 'PROVA PLANNING', 'Ciurma Test']]);
  expect(
    (
      await page.request.post('/api/planning', {
        multipart: { kind: 'students', file: file(emptyExtra) },
      })
    ).status(),
  ).toBe(200);
  data = await (await page.request.get('/api/planning')).json();
  const matching = data.students.filter(
    (row: { values: { _studentId: string } }) => row.values._studentId === String(studentId),
  );
  expect(matching).toHaveLength(1);
  expect(matching[0].values).toMatchObject({
    entry: '08:55',
    lessonHour: '2',
    device: 'Computer personale',
  });
  const download = await page.request.get('/api/planning?export=1&kind=students');
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load((await download.body()) as never);
  expect(exported.getWorksheet('Studenti')?.getRow(1).values).toEqual(
    expect.arrayContaining([
      'Classe',
      'Nr.',
      'Alunno/a',
      'Entrate/Uscite',
      'Ora di lezione',
      'Entrata',
      'Uscita',
    ]),
  );
  await page.goto('/planning');
  const panel = page.locator('.planning-section').nth(1);
  const row = panel.locator('tr').filter({ hasText: 'PROVA PLANNING' });
  await row.getByRole('button', { name: 'Entrata', exact: true }).click();
  await expect(panel.getByLabel(/Entrate\/Uscite riga/)).toHaveValue('Entrata');
  await expect(panel.getByLabel(/Ora di lezione riga/)).toHaveValue('2');
  await expect(panel.getByLabel(/^Entrata riga/)).toHaveValue('08:55');
});

test('promotion preserves the same student account, grades and planning row', async ({
  request,
  page,
}) => {
  await request.post('/api/auth/login', { data: admin });
  const original = await workbook([['3ZZ', 1, 'STUDENTE PROMOSSO', 'Pirati']]);
  expect(
    (
      await request.post('/api/admin/upload', {
        multipart: { mode: 'details', file: file(original) },
      })
    ).status(),
  ).toBe(200);
  const before = await (await request.get('/api/planning')).json();
  const student = before.students.find(
    (row: { values: { student: string } }) => row.values.student === 'STUDENTE PROMOSSO',
  );
  const id = Number(student.values._studentId);
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          email: 's-studente.promosso@isiskeynes.it',
          password: 'Student123!',
          confirm: 'Student123!',
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post('/api/admin/grade', {
        data: { user_id: id, date: '2026-09-14', type: 'verifica', grade: 8 },
      })
    ).status(),
  ).toBe(200);
  const next = await workbook([['4ZZ', 1, 'STUDENTE PROMOSSO', 'Nuova Ciurma']]);
  expect(
    (
      await request.post('/api/planning', { multipart: { kind: 'students', file: file(next) } })
    ).status(),
  ).toBe(200);
  const after = await (await request.get('/api/planning')).json();
  const rows = after.students.filter(
    (row: { values: { _studentId: string } }) => row.values._studentId === String(id),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].values).toMatchObject({ classCode: '4ZZ', crew: 'Nuova Ciurma' });
  const details = await (await request.get(`/api/data?student=${id}`)).json();
  expect(details.grades).toHaveLength(1);
  expect(details.total).toBe(1600);
  expect((await page.request.get(`/api/data?student=${id}`)).status()).toBe(200);
});

test('a bad Planning row leaves the roster and student planning untouched', async ({ request }) => {
  await request.post('/api/auth/login', { data: admin });
  const invalid = await workbook(
    [['3EX', 1, 'STUDENTE ERRATO', 'Ciurma']],
    [['2026-02-31', '3EX', 'TPSIT', '', 'Prova', '']],
  );
  const response = await request.post('/api/planning', {
    multipart: { kind: 'workbook', file: file(invalid) },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain('Planning, riga 2');
  const data = await (await request.get('/api/planning')).json();
  expect(
    data.students.some(
      (row: { values: { student: string } }) => row.values.student === 'STUDENTE ERRATO',
    ),
  ).toBe(false);
  expect(
    (
      await request.post('/api/auth/registration-student', {
        data: { email: 's-studente.errato@isiskeynes.it' },
      })
    ).status(),
  ).toBe(403);
});

test('annual import previews fifth-year removals, requires confirmation and rechecks the list', async ({
  request,
  page,
}) => {
  await request.post('/api/auth/login', { data: admin });
  const old = await workbook([
    ['5ZY', 1, 'QUINTA USCENTE', 'Ciurma'],
    ['4ZY', 2, 'QUARTA RESTANTE', 'Ciurma'],
  ]);
  expect(
    (
      await request.post('/api/planning', { multipart: { kind: 'students', file: file(old) } })
    ).status(),
  ).toBe(200);
  const all = await (await request.get('/api/planning')).json();
  const graduated = all.students.find(
    (row: { values: { student: string } }) => row.values.student === 'QUINTA USCENTE',
  );
  const id = Number(graduated.values._studentId);
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          email: 's-quinta.uscente@isiskeynes.it',
          password: 'Student123!',
          confirm: 'Student123!',
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post('/api/admin/grade', {
        data: { user_id: id, date: '2026-10-01', type: 'verifica', grade: 7 },
      })
    ).status(),
  ).toBe(200);
  const next = await workbook([['5ZY', 1, 'QUARTA RESTANTE', 'Ciurma']]);
  expect(
    (
      await request.post('/api/planning', { multipart: { kind: 'workbook', file: file(next) } })
    ).status(),
  ).toBe(200);
  expect((await request.get(`/api/data?student=${id}`)).status()).toBe(200);
  const preview = await request.post('/api/planning', {
    multipart: { kind: 'workbook', file: file(next), annual: '1', preview: '1' },
  });
  expect(preview.status()).toBe(200);
  const list = (await preview.json()).graduating as { id: number }[];
  expect(list.some((item) => item.id === id)).toBe(true);
  expect((await request.get(`/api/data?student=${id}`)).status()).toBe(200);
  const missingConfirmation = await request.post('/api/planning', {
    multipart: { kind: 'workbook', file: file(next), annual: '1' },
  });
  expect(missingConfirmation.status()).toBe(400);
  const outdated = await request.post('/api/planning', {
    multipart: { kind: 'workbook', file: file(next), annual: '1', graduatedIds: '[]' },
  });
  expect(outdated.status()).toBe(400);
  expect((await request.get(`/api/data?student=${id}`)).status()).toBe(200);
  const newlyGraduated = await workbook([['5ZW', 1, 'ALTRO USCENTE', 'Ciurma']]);
  expect(
    (
      await request.post('/api/planning', {
        multipart: { kind: 'students', file: file(newlyGraduated) },
      })
    ).status(),
  ).toBe(200);
  const changed = await request.post('/api/planning', {
    multipart: {
      kind: 'workbook',
      file: file(next),
      annual: '1',
      graduatedIds: JSON.stringify(list.map((item) => item.id)),
    },
  });
  expect(changed.status()).toBe(400);
  expect((await request.get(`/api/data?student=${id}`)).status()).toBe(200);
  const reviewed = await request.post('/api/planning', {
    multipart: { kind: 'workbook', file: file(next), annual: '1', preview: '1' },
  });
  const reviewedList = (await reviewed.json()).graduating as { id: number }[];
  const confirmed = await request.post('/api/planning', {
    multipart: {
      kind: 'workbook',
      file: file(next),
      annual: '1',
      graduatedIds: JSON.stringify(reviewedList.map((item) => item.id)),
    },
  });
  expect(confirmed.status()).toBe(200);
  expect((await confirmed.json()).counts.Rimossi).toBe(reviewedList.length);
  expect((await request.get(`/api/data?student=${id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/data?student=${id}`)).status()).toBe(403);
  const after = await (await request.get('/api/planning')).json();
  expect(
    after.students.some(
      (row: { values: { _studentId?: string } }) => row.values._studentId === String(id),
    ),
  ).toBe(false);
  expect(
    after.students.some(
      (row: { values: { student: string; classCode: string } }) =>
        row.values.student === 'QUARTA RESTANTE' && row.values.classCode === '5ZY',
    ),
  ).toBe(true);
});

test('duplicate names block annual cleanup rather than removing another student’s archives', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE users (id INTEGER PRIMARY KEY,role TEXT,first_name TEXT,last_name TEXT); CREATE TABLE grades (id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE); CREATE TABLE imported_rows (id INTEGER PRIMARY KEY,sheet TEXT,data TEXT); INSERT INTO users VALUES (1,'student','Luca','Rossi'),(2,'student','Luca','Rossi'); INSERT INTO grades VALUES (9,1),(10,2);",
  );
  await expect(
    removeGraduatingStudents(db, [
      { id: 1, first_name: 'Luca', last_name: 'Rossi', class_code: '5ZZ' },
    ]),
  ).rejects.toThrow(/nome/);
  expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 2 });
  expect(db.prepare('SELECT COUNT(*) AS n FROM grades').get()).toEqual({ n: 2 });
  db.close();
});

test('annual import presents a review in the Planning page before removing fifth-year students', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', { data: admin });
  const old = await workbook([['5UI', 1, 'VISIVO USCENTE', 'Ciurma']]);
  expect(
    (
      await page.request.post('/api/planning', { multipart: { kind: 'students', file: file(old) } })
    ).status(),
  ).toBe(200);
  const existing = await (await page.request.get('/api/planning')).json();
  const student = existing.students.find(
    (row: { values: { student: string } }) => row.values.student === 'VISIVO USCENTE',
  );
  const id = Number(student.values._studentId);
  await page.goto('/planning');
  await page.getByLabel('Importazione annuale', { exact: true }).check();
  const incoming = await workbook([['3UI', 1, 'VISIVO PRESENTE', 'Ciurma']]);
  await page.getByLabel('Importa file Planning e Studenti').setInputFiles(file(incoming));
  const preview = page.getByRole('region', { name: 'Anteprima importazione annuale' });
  await expect(preview).toContainText('Visivo Uscente');
  expect((await page.request.get(`/api/data?student=${id}`)).status()).toBe(200);
  await preview.getByRole('button', { name: 'Conferma importazione annuale' }).click();
  await expect(
    page.getByText(/Importazione completata:.*studenti di quinta rimossi/),
  ).toBeVisible();
  expect((await page.request.get(`/api/data?student=${id}`)).status()).toBe(404);
});

test('annual cleanup removes linked records and matching imported archives only', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE users (id INTEGER PRIMARY KEY,role TEXT,first_name TEXT,last_name TEXT); CREATE TABLE grades (id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE); CREATE TABLE imported_rows (id INTEGER PRIMARY KEY,sheet TEXT,data TEXT); INSERT INTO users VALUES (1,'student','Uscente','Quinta'),(2,'student','Altro','Alunno'); INSERT INTO grades VALUES (9,1),(10,2);",
  );
  const insert = db.prepare('INSERT INTO imported_rows(sheet,data) VALUES(?,?)');
  insert.run('__weapon:grade:9', '{}');
  insert.run('__weapon:grade:10', '{}');
  insert.run(
    '__planning:students',
    JSON.stringify({ _studentId: '1', student: 'QUINTA USCENTE', classCode: '5ZY' }),
  );
  insert.run(
    'One Piece',
    JSON.stringify({ row: 2, values: ['2026-09-01', 1, '5ZY', 'QUINTA USCENTE', 'Bug', 50] }),
  );
  insert.run(
    'One Piece',
    JSON.stringify({ row: 4, values: ['2025-09-01', 1, '4ZY', 'QUINTA USCENTE', 'Bug', 30] }),
  );
  insert.run(
    'One Piece',
    JSON.stringify({ row: 3, values: ['2026-09-01', 1, '5ZY', 'ALTRO ALUNNO', 'Bug', 50] }),
  );
  await removeGraduatingStudents(db, [
    { id: 1, first_name: 'Uscente', last_name: 'Quinta', class_code: '5ZY' },
  ]);
  expect(db.prepare('SELECT id FROM users ORDER BY id').all()).toEqual([{ id: 2 }]);
  expect(db.prepare('SELECT id FROM grades ORDER BY id').all()).toEqual([{ id: 10 }]);
  expect(db.prepare('SELECT sheet FROM imported_rows ORDER BY id').all()).toEqual([
    { sheet: '__weapon:grade:10' },
    { sheet: 'One Piece' },
  ]);
  db.close();
});


