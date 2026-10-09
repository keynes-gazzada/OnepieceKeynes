import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';

test('an unauthenticated caller cannot write grades through the admin API', async ({ request }) => {
  const response = await request.post('/api/admin/grade', {
    data: { user_id: 2, date: '2026-09-26', type: 'verifica', grade: 8 },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: 'Accesso riservato al narratore.' });
});

test('the login API rejects a request from a different origin', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    headers: { origin: 'https://attacker.example' },
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: 'Richiesta non autorizzata.' });
});

test('the admin API rejects an impossible calendar date', async ({ request }) => {
  const login = await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  expect(login.status()).toBe(200);

  const response = await request.post('/api/admin/grade', {
    data: { user_id: 2, subject: 'TePi', date: '2026-02-31', type: 'verifica', grade: 8 },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: 'Voto non valido.' });
});

test('the data API rejects an impossible calendar date', async ({ request }) => {
  const login = await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  expect(login.status()).toBe(200);

  const response = await request.get('/api/data?date=2026-02-31');

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: 'Data non valida.' });
});

test('registration requires an imported student and their school email', async ({ request }) => {
  const login = await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  expect(login.status()).toBe(200);

  const workbook = new ExcelJS.Workbook();
  const students = workbook.addWorksheet('Studenti');
  students.addRow(['Classe', 'Nr.', 'Alunno/a', 'Ciurma']);
  students.addRow(['3CI', 1, 'TESTER MARIO', 'Mugiwara']);
  const points = workbook.addWorksheet('One Piece');
  points.addRow(['Data', 'Rotta', 'Classe', 'Pirata', 'Tipologia', 'Punti', 'Voto', 'Materia']);
  points.addRow([new Date('2026-09-29T00:00:00Z'), 1, '3CI', 'TESTER MARIO', 'Bug', 120, null, 'TPSIT']);
  const file = Buffer.from(await workbook.xlsx.writeBuffer());

  const upload = await request.post('/api/admin/upload', {
    multipart: {
      mode: 'details',
      file: {
        name: 'Punti.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: file,
      },
    },
  });
  expect(upload.status()).toBe(200);
  await expect(upload.json()).resolves.toMatchObject({
    ok: true,
    counts: { Studenti: 1, Ciurme: 1, 'One Piece': 1 },
  });

  const unknownStudent = await request.post('/api/auth/register', {
    data: {
      first: 'Altro',
      last: 'Nonpresente',
      classCode: '3CI',
      email: 's-nonpresente.altro@isiskeynes.it',
      password: 'Student123!',
      confirm: 'Student123!',
    },
  });
  expect(unknownStudent.status()).toBe(403);
  await expect(unknownStudent.json()).resolves.toEqual({
    error: 'Non risulti nell’elenco degli studenti.',
  });

  const wrongEmail = await request.post('/api/auth/register', {
    data: {
      first: 'Mario',
      last: 'Tester',
      classCode: '3CI',
      email: 's-mario.tester@isiskeynes.it',
      password: 'Student123!',
      confirm: 'Student123!',
    },
  });
  expect(wrongEmail.status()).toBe(403);
  await expect(wrongEmail.json()).resolves.toEqual({
    error: 'Non risulti nell’elenco degli studenti.',
  });

  const registration = await request.post('/api/auth/register', {
    data: {
      first: 'Nome manipolato',
      last: 'Cognome manipolato',
      classCode: '5CI',
      email: 's-tester.mario@isiskeynes.it',
      password: 'Student123!',
      confirm: 'Student123!',
    },
  });
  expect(registration.status()).toBe(200);

  const profile = await request.get('/profilo');
  expect(profile.status()).toBe(200);
  expect(await profile.text()).toContain('Tester');
  expect(await profile.text()).not.toContain('Nome manipolato');
});
