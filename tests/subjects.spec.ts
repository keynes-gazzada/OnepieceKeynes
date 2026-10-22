import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';

test('new point rules persist consistently in daily entries, grades and rankings', async ({
  request,
}) => {
  await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const date = '2026-11-01',
    subject = 'TePi',
    user_id = 3;
  const totals = async () =>
    (await (await request.get(`/api/data?date=${date}&subject=${subject}&totalsOnly=1`)).json())
      .totals[user_id];
  const before = await totals();
  expect(
    (
      await request.post('/api/admin/registry', {
        data: {
          date,
          subject,
          rows: [
            {
              user_id,
              presence: 'A+',
              phone: '+',
              bug: 3,
              anxiety: true,
              mystery: true,
              multiverse: 'Nuove regole',
              multiverse_points: 240,
            },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  for (const [type, grade, points] of [['progetto', 7, 700]] as const) {
    const response = await request.post('/api/admin/grade', {
      data: { user_id, date, subject, type, grade },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).points).toBe(points);
  }
  const stored = await (await request.get(`/api/data?date=${date}&subject=${subject}`)).json();
  expect(stored.daily.find((r: { user_id: number }) => r.user_id === user_id)).toMatchObject({
    presence: 'A+',
    phone: '+',
    bug: 3,
    anxiety: 1,
    mystery: 1,
    multiverse_points: 240,
  });
  // -80 +30 +150 -30 +2000 +240 +700, with no base bonus.
  expect(await totals()).toBe(before + 3010);
});

test('narrator totals include imported points and refresh after saving without counting draft defaults', async ({
  request,
  page,
}) => {
  await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Studenti').addRows([
    ['Classe', 'Nr.', 'Alunno/a', 'Ciurma'],
    ['3CI', 1, 'IMPORTATI TOTALE', 'Totali'],
    ['3CI', 2, 'ALTO PUNTEGGIO', 'Totali'],
  ]);
  workbook.addWorksheet('One Piece').addRows([
    ['Data', 'Rotta', 'Classe', 'Pirata', 'Tipologia', 'Punti', 'Voto', 'Materia'],
    [new Date('2026-09-16T12:00:00Z'), 1, '3CI', 'IMPORTATI TOTALE', 'Bug', 1230, null, 'TPSIT'],
    [new Date('2026-09-16T12:00:00Z'), 1, '3CI', 'IMPORTATI TOTALE', 'Bug', 70, null, 'SER'],
    [new Date('2026-09-16T12:00:00Z'), 1, '3CI', 'ALTO PUNTEGGIO', 'Bug', 12000, null, 'TPSIT'],
  ]);
  const upload = await request.post('/api/admin/upload', {
    multipart: {
      mode: 'details',
      file: {
        name: 'Punti.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      },
    },
  });
  expect(upload.status()).toBe(200);
  await page.goto('/accedi');
  await page.locator('input[name="email"]').fill('narratore@demo.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(/\/narratore$/);
  await page.goto('/narratore?classe=3CI&materia=TPSIT');
  await page.getByLabel('Data', { exact: true }).fill('2026-10-09');
  const row = page.locator('.registry-table tbody tr').filter({ hasText: /Importati Totale/i });
  await expect(row.locator('td').last()).toHaveText('1300');
  await expect(row.locator('td').nth(11)).toHaveText('30');
  await page.getByRole('button', { name: 'Ordina per Totale punti', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Ordina per Totale punti' })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  await expect(page.locator('.registry-table tbody tr').first()).toContainText('Alto Punteggio');
  await page.getByRole('button', { name: 'Ordina per Totale punti', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Ordina per Totale punti' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await expect(page.locator('.registry-table tbody tr').last()).toContainText('Alto Punteggio');
  await page.getByLabel('Seleziona tutti i telefoni').check();
  await page.getByLabel('Seleziona tutti i telefoni').uncheck();
  await row.getByLabel('Telefono di Totale').selectOption('+');
  await page.getByRole('button', { name: 'Ordina per Telefono', exact: true }).click();
  await expect(page.locator('.registry-table tbody tr').first()).toContainText('Importati Totale');
  await page.getByRole('button', { name: 'Ordina per Telefono', exact: true }).click();
  await expect(page.locator('.registry-table tbody tr').last()).toContainText('Importati Totale');
  await expect(row.getByLabel('Telefono di Totale')).toHaveValue('+');
  await row.getByLabel('Telefono di Totale').selectOption('');
  await row.getByLabel('Presenza di Totale').selectOption('A+');
  await expect(row.locator('td').nth(11)).toHaveText('-80');
  await page.getByRole('button', { name: 'Ordina per Totale giornata', exact: true }).click();
  await expect(page.locator('.registry-table tbody tr').last()).toContainText('Importati Totale');
  await page.getByRole('button', { name: 'Ordina per Totale giornata', exact: true }).click();
  await expect(page.locator('.registry-table tbody tr').first()).toContainText('Importati Totale');
  await expect(row.locator('td').last()).toHaveText('1300');
  await page.getByRole('button', { name: 'Salva registro', exact: true }).click();
  await expect(row.locator('td').last()).toHaveText('1220');
  await page.getByLabel('Data', { exact: true }).fill('2026-10-10');
  await expect(row.locator('td').last()).toHaveText('1220');
  await expect(page.getByRole('navigation', { name: /^Registri/ })).toHaveCount(0);
});
