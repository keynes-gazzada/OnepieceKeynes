import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';

test('daily totals include only imports for the selected date across subjects without duplicating saved points', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Studenti').addRows([
    ['Classe', 'Nr.', 'Alunno/a', 'Ciurma'],
    ['4CI', 1, 'LEZIONE ODIERNA', 'Lezioni'],
    ['4CI', 2, 'DATI MARCATI', 'Lezioni'],
    ['4CI', 3, 'NESSUNA ATTIVITA', 'Lezioni'],
  ]);
  workbook.addWorksheet('One Piece').addRows([
    ['Data', 'Rotta', 'Classe', 'Pirata', 'Tipologia', 'Punti', 'Voto', 'Materia'],
    [new Date('2026-10-08T12:00:00Z'), 1, '4CI', 'LEZIONE ODIERNA', 'Bug', 300, null, 'TPSIT'],
    [new Date('2026-10-09T12:00:00Z'), 1, '4CI', 'LEZIONE ODIERNA', 'Verifica', 150, null, 'TPSIT'],
    [new Date('2026-10-09T12:00:00Z'), 1, '4CI', 'LEZIONE ODIERNA', 'Bug', 50, null, 'TPSIT'],
    [new Date('2026-10-09T12:00:00Z'), 1, '4CI', 'LEZIONE ODIERNA', 'Bug', 70, null, 'SER'],
    [new Date('2026-10-08T12:00:00Z'), 1, '4CI', 'DATI MARCATI', 'Telefono', 30, null, 'TPSIT'],
    [new Date('2026-10-09T12:00:00Z'), 1, '4CI', 'DATI MARCATI', 'Telefono', 30, null, 'TPSIT'],
    [new Date('2026-10-09T12:00:00Z'), 1, '4CI', 'DATI MARCATI', 'Bug', 50, null, 'TPSIT'],
    [new Date('2026-10-09T12:00:00Z'), 1, '4CI', 'DATI MARCATI', 'Assenza', -40, null, 'TPSIT'],
  ]);
  expect(
    (
      await page.request.post('/api/admin/upload', {
        multipart: {
          mode: 'details',
          file: {
            name: 'Punti.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
          },
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/narratore?classe=4CI&materia=TPSIT');
  await page.getByLabel('Data', { exact: true }).fill('2026-10-09');
  const row = page.locator('.registry-table tbody tr').filter({ hasText: /Lezione Odierna/i });
  const day = row.locator('td').nth(11),
    total = row.locator('td').last();
  await expect(day).toHaveText('300');
  await expect(total).toHaveText('570');
  await expect(row.getByLabel('Bug di Odierna')).toHaveValue('0');
  await expect(row.getByLabel('Telefono di Odierna')).toHaveValue('+');
  await expect(row.getByLabel('Presenza di Odierna')).toHaveValue('P');
  await expect(page.getByLabel('Presenza di Attivita')).toHaveValue('P');
  const importedRow = page.locator('.registry-table tbody tr').filter({ hasText: /Dati Marcati/i });
  await expect(importedRow.getByLabel('Bug di Marcati')).toHaveValue('0');
  await expect(importedRow.getByLabel('Telefono di Marcati')).toHaveValue('+');
  await expect(importedRow.getByLabel('Presenza di Marcati')).toHaveValue('P');
  await expect(importedRow.locator('td').nth(11)).toHaveText('70');
  await expect(importedRow.locator('td').last()).toHaveText('70');
  await page.getByLabel('Data', { exact: true }).fill('2026-10-10');
  await expect(day).toHaveText('30');
  await expect(page.getByLabel('Presenza di Attivita')).toHaveValue('P');
  await expect(row.getByLabel('Bug di Odierna')).toHaveValue('0');
  await expect(importedRow.getByLabel('Presenza di Marcati')).toHaveValue('P');
  await expect(importedRow.getByLabel('Telefono di Marcati')).toHaveValue('+');
  await expect(total).toHaveText('570');
  await page.getByLabel('Data', { exact: true }).fill('2026-10-08');
  await expect(day).toHaveText('330');
  await page.getByLabel('Data', { exact: true }).fill('2026-10-09');
  await expect(day).toHaveText('300');
  await page.getByLabel('Seleziona tutti i telefoni').uncheck();
  await expect(day).toHaveText('270');
  await row.getByLabel('Bug di Odierna').fill('1');
  await expect(day).toHaveText('320');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Salva registro', exact: true }).click();
    await expect(total).toHaveText('620');
    await expect(importedRow.locator('td').nth(11)).toHaveText('40');
    await expect(importedRow.locator('td').last()).toHaveText('70');
    await page.reload();
    await expect(day).toHaveText('320');
    await expect(total).toHaveText('620');
    await expect(row.getByLabel('Bug di Odierna')).toHaveValue('1');
  }
  await row.getByLabel('Bug di Odierna').fill('0');
  await expect(day).toHaveText('270');
  await page.getByRole('button', { name: 'Salva registro', exact: true }).click();
  await expect(total).toHaveText('570');
  await page.reload();
  await expect(day).toHaveText('270');
  await expect(importedRow.locator('td').nth(11)).toHaveText('40');
  await expect(importedRow.locator('td').last()).toHaveText('70');
  await expect(importedRow.getByLabel('Bug di Marcati')).toHaveValue('0');
  await expect(importedRow.getByLabel('Telefono di Marcati')).toHaveValue('');
  await expect(importedRow.getByLabel('Presenza di Marcati')).toHaveValue('P');
});
