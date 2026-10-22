import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { dailyPoints } from '../lib/point-rules';
import type { Daily } from '../lib/registry-core';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  expect(response.status()).toBe(200);
});

test('same-day lessons remain independent and share one exact ranking balance', async ({
  request,
}) => {
  const date = '2027-04-01';
  const load = async (subject = '') =>
    (await request.get(`/api/data?date=${date}&subject=${subject}`)).json();
  const total = async () =>
    (await (await request.get(`/api/data?date=${date}&totalsOnly=1`)).json()).totals[2];
  const before = await total();
  const rows = {
    TPSIT: { user_id: 2, presence: 'P', phone: '+', bug: 2, multiverse_points: 80 },
    SER: { user_id: 2, presence: 'A', phone: '', bug: 1, multiverse_points: 0 },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const [subject, row] of Object.entries(rows)) {
      expect(
        (
          await request.post('/api/admin/registry', {
            data: { date, subject, rows: [row] },
          })
        ).status(),
      ).toBe(200);
    }
    for (const [subject, row] of Object.entries(rows)) {
      const data = await load(subject);
      expect(data.daily.filter((r: Daily) => r.user_id === 2)).toHaveLength(1);
      expect(data.daily.find((r: Daily) => r.user_id === 2)).toMatchObject({ ...row, subject });
    }
    expect(await total()).toBe(before + 220);
  }
  expect((await load('TePi')).daily).toEqual((await load('TPSIT')).daily);
  expect(
    (
      await request.post('/api/admin/registry', {
        data: { date, subject: 'TePi', rows: [{ ...rows.TPSIT, bug: 4 }] },
      })
    ).status(),
  ).toBe(200);
  expect(await total()).toBe(before + 320);
  expect((await load('SER')).daily.find((r: Daily) => r.user_id === 2)).toMatchObject(rows.SER);
  expect((await load()).daily.find((r: Daily) => r.user_id === 2)).toBeUndefined();
  const data = await load('TPSIT');
  expect(data.otherDailyPoints[2]).toBe(10);
  expect(
    dailyPoints(data.daily.find((r: Daily) => r.user_id === 2)) + data.otherDailyPoints[2],
  ).toBe(320);
  for (const subject of [undefined, null, '', '   ', 'unknown', { invalid: true }]) {
    expect(
      (
        await request.post('/api/admin/registry', {
          data: { date, subject, rows: [rows.SER] },
        })
      ).status(),
    ).toBe(400);
  }
  expect((await request.get(`/api/data?date=${date}&subject=unknown`)).status()).toBe(400);
  expect(await total()).toBe(before + 320);
});

test('general Excel updates and offsets never replace or discount named lessons', async ({
  request,
}) => {
  const date = '2027-04-02';
  const row = { user_id: 2, presence: 'P', phone: '+', bug: 2 };
  const book = new ExcelJS.Workbook();
  book.addWorksheet('One Piece').addRows([
    ['Data', 'Rotta', 'Classe', 'Pirata', 'Tipologia', 'Punti'],
    [new Date(`${date}T12:00:00Z`), 1, '3CI', 'ROSSI NAMI', 'Bug', 70],
  ]);
  expect(
    (
      await request.post('/api/admin/upload', {
        multipart: {
          mode: 'details',
          file: {
            name: 'Lessons.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from(await book.xlsx.writeBuffer()),
          },
        },
      })
    ).status(),
  ).toBe(200);
  const total = async () =>
    (await (await request.get(`/api/data?date=${date}&totalsOnly=1`)).json()).totals[2];
  const before = await total();
  for (const subject of ['TPSIT', 'SER']) {
    expect(
      (
        await request.post('/api/admin/registry', { data: { date, subject, rows: [row] } })
      ).status(),
    ).toBe(200);
    const data = await (await request.get(`/api/data?date=${date}&subject=${subject}`)).json();
    expect(data.importedRegistry).toEqual({});
    expect(data.daily.find((r: Daily) => r.user_id === 2).imported_points_offset).toBe(0);
  }
  expect(await total()).toBe(before + 260);
  const update = new ExcelJS.Workbook();
  update.addWorksheet('Update').addRows([
    ['Mail', 'Data', 'Presenza', 'Telefono', 'Bug', 'Frutti', 'Note'],
    ['studentessa@demo.local', date, 'P', '', 1, 9, 'Conservato'],
  ]);
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(
      (
        await request.post('/api/admin/upload', {
          multipart: {
            mode: 'update',
            file: {
              name: 'Update.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              buffer: Buffer.from(await update.xlsx.writeBuffer()),
            },
          },
        })
      ).status(),
    ).toBe(200);
    expect(await total()).toBe(before + 319);
    for (const subject of ['TPSIT', 'SER']) {
      const data = await (await request.get(`/api/data?date=${date}&subject=${subject}`)).json();
      expect(data.daily.find((r: Daily) => r.user_id === 2)).toMatchObject({ ...row, subject });
    }
  }
});

test('crew mystery awards stay within the selected lesson', async ({ request }) => {
  const date = '2027-04-03';
  for (const subject of ['TPSIT', 'SER']) {
    expect(
      (
        await request.post('/api/admin/registry', {
          data: {
            date,
            subject,
            rows: [2, 3].map((user_id) => ({ user_id, presence: 'P', phone: '', mystery: false })),
          },
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await request.post('/api/admin/registry', {
        data: {
          date,
          subject: 'TPSIT',
          rows: [{ user_id: 2, presence: 'P', phone: '', mystery: true }],
        },
      })
    ).status(),
  ).toBe(200);
  const tpsit = await (await request.get(`/api/data?date=${date}&subject=TPSIT`)).json();
  const ser = await (await request.get(`/api/data?date=${date}&subject=SER`)).json();
  expect(
    tpsit.daily
      .filter((r: Daily) => [2, 3].includes(r.user_id))
      .every((r: Daily) => r.mystery === 1),
  ).toBe(true);
  expect(ser.daily.every((r: Daily) => r.mystery === 0)).toBe(true);
});

test('narrator can save TPSIT and SER on the same day and reopen each register', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const before = (await (await page.request.get('/api/data?date=2027-04-04&totalsOnly=1')).json())
    .totals[2];
  const expectedTotal = new Intl.NumberFormat('it-IT').format(before + 210);
  await page.goto('/narratore?classe=3CI&data=2027-04-04');
  const subject = page.getByLabel('Materia', { exact: true });
  const save = page.getByRole('button', { name: 'Salva registro', exact: true });
  const row = page.locator('.registry-table tbody tr').filter({ hasText: 'Rossi Nami' });
  await expect(subject).toHaveValue('');
  await expect(subject).toHaveAttribute('required', '');
  await expect(subject.getByRole('option', { name: 'Registro generale', exact: true })).toHaveCount(
    0,
  );
  await expect(
    subject.getByRole('option', { name: 'Seleziona una materia', exact: true }),
  ).toHaveAttribute('disabled', '');
  await expect(save).toBeDisabled();
  await expect(row.getByLabel('Bug di Nami')).toBeDisabled();
  await expect(
    row.getByRole('button', { name: 'Sogni di Nami Rossi', exact: true }),
  ).toBeDisabled();
  await subject.selectOption('TPSIT');
  await expect(save).toBeEnabled();
  await row.getByLabel('Bug di Nami').fill('2');
  await save.click();
  await expect(page.locator('.registry-section [role="status"]')).toContainText('TPSIT salvato');
  await subject.selectOption('SER');
  await expect(row.getByLabel('Bug di Nami')).toHaveValue('0');
  await expect(row.locator('td').nth(11)).toHaveText('160');
  await row.getByLabel('Bug di Nami').fill('1');
  await save.click();
  await expect(page.locator('.registry-section [role="status"]')).toContainText('SER salvato');
  await expect(row.locator('td').last()).toHaveText(expectedTotal);
  await page.reload();
  await expect(subject).toHaveValue('SER');
  await expect(row.getByLabel('Bug di Nami')).toHaveValue('1');
  await subject.selectOption('TPSIT');
  await expect(row.getByLabel('Bug di Nami')).toHaveValue('2');
  await expect(row.locator('td').nth(11)).toHaveText('210');
  await expect(row.locator('td').last()).toHaveText(expectedTotal);
  await page.goto('/viaggio?classe=3CI');
  await expect(page.locator('.leaderboard')).toHaveCount(1);
  await expect(
    page.locator('.leader-row').filter({ hasText: 'Rossi Nami' }).locator('.leader-score'),
  ).toHaveText(`${expectedTotal} ฿`);
  await page.request.post('/api/auth/login', {
    data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/profilo');
  await expect(page.locator('.profile-balance > strong')).toHaveText(`${expectedTotal} ฿`);
  await page.getByRole('button', { name: /La tua taglia/ }).click();
  const day = page
    .getByRole('dialog')
    .getByRole('row')
    .filter({ hasText: 'Giornata' })
    .filter({ hasText: /04\/0?4\/2027/ });
  await expect(day).toHaveCount(1);
});
