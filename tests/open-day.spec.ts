import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';

const narrator = { email: 'narratore@demo.local', password: 'Demo1234!' };
const student = { email: 'studentessa@demo.local', password: 'Demo1234!' };

test('navigation and planning are reserved to the narrator', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Classifiche' })).toHaveCount(
    0,
  );
  expect((await page.request.get('/api/planning')).status()).toBe(403);
  await page.request.post('/api/auth/login', { data: student });
  expect((await page.request.get('/api/planning')).status()).toBe(403);
  expect(
    (
      await page.request.post('/api/planning', {
        data: { kind: 'students', action: 'create', values: {} },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/planning');
  await expect(page).toHaveURL(/\/profilo/);
  await page.request.post('/api/auth/logout');
  await page.request.post('/api/auth/login', { data: narrator });
  await page.goto('/planning');
  await expect(page.getByRole('heading', { name: 'Planning', exact: true }).first()).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
  await expect(nav.locator('.nav-links a')).toHaveText([
    'Home',
    'Classifiche',
    'Regole',
    'Narratore',
    'Planning',
  ]);
});

test('planning supports editing and an Excel round trip', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: narrator });
  await page.goto('/planning');
  const panel = page.locator('.planning-section').first();
  await panel.getByRole('button', { name: 'Aggiungi riga' }).click();
  await panel.getByLabel('Data', { exact: true }).fill('2026-11-07');
  await panel.getByLabel('Classe', { exact: true }).fill('3CI');
  await panel.getByLabel('Materia', { exact: true }).fill('TPSIT');
  await panel.getByLabel('Argomento', { exact: true }).fill('Reti');
  await panel.getByRole('button', { name: 'Salva riga' }).click();
  await expect(panel.locator('tbody')).toContainText('Reti');
  await panel
    .getByRole('button', { name: /Modifica riga/ })
    .first()
    .click();
  await panel.getByLabel('Argomento', { exact: true }).fill('Reti e protocolli');
  await panel.getByRole('button', { name: 'Salva riga' }).click();
  await expect(panel.locator('tbody')).toContainText('Reti e protocolli');
  const exported = await page.request.get('/api/planning?export=1&kind=planning');
  expect(exported.ok()).toBeTruthy();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await exported.body()) as never);
  expect(workbook.getWorksheet('Planning')?.getRow(2).getCell(5).text).toBe('Reti e protocolli');
  await panel.getByLabel('Importa Excel Planning').setInputFiles({
    name: 'planning.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await exported.body(),
  });
  await expect(panel.getByRole('status')).toHaveText('1 righe importate.');
  await expect(panel.locator('tbody tr')).toHaveCount(2);
  const bad = await page.request.post('/api/planning', {
    multipart: {
      kind: 'students',
      file: {
        name: 'bad.xlsx',
        mimeType: 'application/octet-stream',
        buffer: await exported.body(),
      },
    },
  });
  expect(bad.status()).toBe(400);
});

test('rules edits persist and registry autosaves successive changes', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: narrator });
  await page.goto('/regole');
  const chapter = page.locator('#ciurme');
  await chapter.getByRole('button', { name: 'Modifica regola' }).click();
  await chapter.getByLabel('Descrizione').fill('Descrizione di prova per la ciurma.');
  await chapter.getByRole('button', { name: 'Salva regola' }).click();
  await expect(chapter.getByRole('button', { name: 'Modifica regola' })).toBeVisible();
  await expect(chapter).toContainText('Descrizione di prova per la ciurma.');
  await page.reload();
  await expect(page.locator('#ciurme')).toContainText('Descrizione di prova per la ciurma.');
  await page.goto('/narratore?classe=3CI&materia=TPSIT&data=2026-11-02');
  const bug = page.getByLabel('Bug di Nami');
  await expect(bug).toBeEnabled();
  await bug.fill('2');
  await expect(
    page.getByText('Le modifiche al registro vengono salvate automaticamente.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Bug di Nami')).toHaveValue('2');
  await page.getByLabel('mystery di Nami').check();
  await expect(
    page.getByText('Le modifiche al registro vengono salvate automaticamente.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('mystery di Luca')).toBeChecked();
  await page.getByLabel('Poseidon').first().check();
  await page.getByLabel('Pluton').first().check();
  await expect(
    page.getByText('Le modifiche al registro vengono salvate automaticamente.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Poseidon').first()).toBeChecked();
  await expect(page.getByLabel('Pluton').first()).toBeChecked();
});

test('ranking shows crew totals and narrator can edit a point movement', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: narrator });
  await page.goto('/viaggio?classe=3CI');
  await expect(page.getByRole('heading', { name: 'Classifica delle ciurme' })).toBeVisible();
  await page.getByRole('button', { name: 'Rossi Nami' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Motivazione').fill('Prova movimento');
  await dialog.getByLabel('Punti extra').fill('125');
  await dialog.getByRole('button', { name: 'Aggiungi punti extra' }).click();
  const row = dialog.locator('tr').filter({ hasText: 'Prova movimento' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Modifica' }).click();
  await dialog.getByLabel('Punti', { exact: true }).fill('150');
  await dialog.getByRole('button', { name: 'Salva movimento' }).click();
  await expect(row).toContainText('150');
  await row.getByRole('button', { name: 'Elimina', exact: true }).click();
  await row.getByRole('button', { name: 'Conferma eliminazione' }).click();
  await expect(row).toHaveCount(0);
});

test('Pluton doubles a linked grade once and can be removed', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: narrator });
  await page.goto('/viaggio?classe=3CI');
  await page.getByRole('button', { name: 'Rossi Nami' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Voti' }).click();
  const grade = dialog.locator('tr').filter({ hasText: '8.5' }).first();
  await expect(grade).toContainText('1700');
  await grade.getByRole('combobox').selectOption('Pluton');
  await expect(grade).toContainText('3400');
  await grade.getByRole('combobox').selectOption('');
  await expect(grade).toContainText('1700');
});

test('individual multiverse entries use the configured value and can be edited and deleted', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', { data: narrator });
  await page.goto('/narratore?classe=3CI&materia=TPSIT&data=2026-11-02');
  const row = page.locator('tr').filter({ hasText: 'Rossi Nami' });
  await row.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrizione attività').fill('Esperimento');
  await dialog.getByRole('button', { name: 'Aggiungi multiverso' }).click();
  const entry = dialog.locator('tr').filter({ hasText: 'Esperimento' });
  await expect(entry).toContainText('80');
  await entry.getByRole('button', { name: 'Modifica' }).click();
  await dialog.getByLabel('Descrizione attività').fill('Esperimento modificato');
  await dialog.getByRole('button', { name: 'Salva multiverso' }).click();
  const changed = dialog.locator('tr').filter({ hasText: 'Esperimento modificato' });
  await expect(changed).toBeVisible();
  await changed.getByRole('button', { name: 'Elimina', exact: true }).click();
  await changed.getByRole('button', { name: 'Conferma eliminazione' }).click();
  await expect(changed).toHaveCount(0);
});

test('an assigned clue credits every member of the selected crew', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: narrator });
  const before = (await (await page.request.get('/api/data?date=2026-11-02&totalsOnly=1')).json())
    .totals;
  await page.goto('/narratore?classe=3CI&materia=TPSIT&data=2026-11-02');
  await page.getByRole('button', { name: 'Indizi di Nami Rossi' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrizione indizio').fill('Mappa cifrata');
  await dialog.getByLabel('Punti per ciascuno').fill('100');
  await dialog.getByRole('button', { name: 'Assegna alla ciurma' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Indizio assegnato a 2 studenti.');
  const after = (await (await page.request.get('/api/data?date=2026-11-02&totalsOnly=1')).json())
    .totals;
  expect(after[2] - before[2]).toBe(100);
  expect(after[3] - before[3]).toBe(100);
  expect(after[4] - before[4]).toBe(0);
});
