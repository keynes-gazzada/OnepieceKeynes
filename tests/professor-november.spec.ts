import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
const credentials = { email: 'narratore@demo.local', password: 'Demo1234!' };
test('a lesson with no class imports and remains editable', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: credentials });
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Planning');
  sheet.addRows([
    ['Data', 'Classe', 'Disciplina', 'Codocente', 'Argomento', 'Note'],
    ['2028-06-05', '', '', '', 'Sostituzione', '3BI'],
  ]);
  const response = await page.request.post('/api/planning', {
    multipart: {
      kind: 'planning',
      file: {
        name: 'Planning.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await book.xlsx.writeBuffer()),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const data = await (await page.request.get('/api/planning')).json();
  const row = data.planning.find((r: any) => r.values.topic === 'Sostituzione');
  expect(row.values.classCode).toBe('');
  expect(
    (
      await page.request.post('/api/planning', {
        data: {
          kind: 'planning',
          action: 'update',
          id: row.id,
          expected: row.version,
          values: { ...row.values, notes: 'Modifica' },
        },
      })
    ).ok(),
  ).toBeTruthy();
});
test('selected grades can be deleted together without touching other students', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', { data: credentials });
  const result = await (
    await page.request.post('/api/admin/grade-bulk', {
      data: {
        date: '2028-06-06',
        type: 'verifica',
        entries: [
          { user_id: 2, grade: 8 },
          { user_id: 3, grade: 7 },
          { user_id: 4, grade: 6 },
        ],
      },
    })
  ).json();
  await page.goto('/narratore?classe=3CI&materia=TPSIT&data=2028-06-06');
  await page.getByRole('button', { name: 'Inserisci voti della classe' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Gestisci voti già inseriti').click();
  await dialog.getByLabel('Seleziona voto 8 di Nami Rossi').check();
  await dialog.getByLabel('Seleziona voto 7 di Luca Bianchi').check();
  await dialog.getByRole('button', { name: 'Elimina voti selezionati' }).click();
  await dialog.getByRole('button', { name: 'Conferma eliminazione di 2 voti' }).click();
  await expect(dialog.getByLabel('Seleziona voto 8 di Nami Rossi')).toHaveCount(0);
  const data = await (await page.request.get('/api/data?date=2028-06-06')).json();
  expect(data.grades.map((g: { id: number }) => g.id)).toEqual([result.grades[2].id]);
  await page.request.post('/api/admin/grade-delete', { data: { id: result.grades[2].id } });
});

test('roles save automatically and the mystery editor opens from its tile', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: credentials });
  await page.goto('/narratore?classe=3CI&materia=TPSIT');
  await page.getByLabel('Ruolo di Nami Rossi', { exact: true }).selectOption('Medico');
  await expect(page.getByText('Ruolo salvato automaticamente.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Ruolo di Nami Rossi', { exact: true })).toHaveValue('Medico');
  await expect(page.locator('.admin-mysteries')).toHaveCount(0);
  await page.getByRole('button', { name: 'Misteri', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Titolo nuovo mistero')).toBeVisible();
});

test('large planning tables remain visible, paginated, searchable and allow reaching students', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', { data: credentials });
  const rows = Array.from({ length: 594 }, (_, i) => ({
    id: i + 1,
    kind: 'planning',
    version: '{}',
    values: {
      date: '2026-11-05',
      classCode: '3CI',
      subject: 'TPSIT',
      coTeacher: '',
      topic: `Lezione ${i + 1}`,
      notes: '',
    },
  }));
  await page.route('**/api/planning', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      json: {
        planning: rows,
        students: [
          {
            id: 1000,
            kind: 'students',
            version: '{}',
            values: { classCode: '3CI', student: 'Studente di prova' },
          },
        ],
      },
    });
  });
  await page.goto('/planning');
  const planning = page.locator('.planning-section').first();
  await expect(planning.locator('tbody tr')).toHaveCount(25);
  await expect(planning.locator('.planning-table')).toHaveCSS('opacity', '1');
  await expect(planning).toContainText('Pagina 1 di 24');
  await planning.getByRole('button', { name: 'Successiva' }).click();
  await expect(planning).toContainText('Lezione 26');
  await planning.getByLabel('Cerca in Planning').fill('Lezione 594');
  await expect(planning.locator('tbody tr')).toHaveCount(1);
  await expect(planning).toContainText('Lezione 594');
  await expect(page.locator('.planning-section').nth(1)).toContainText('Studente di prova');
});

test('student planning uses dialogs for editing and confirming deletion', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: credentials });
  const add = await page.request.post('/api/planning', {
    data: {
      kind: 'students',
      action: 'create',
      values: { classCode: '3CI', student: 'Studente Prova Popup', crew: 'Equipaggio' },
    },
  });
  expect(add.ok()).toBeTruthy();
  await page.goto('/planning');
  const section = page.locator('.planning-section').nth(1);
  const row = section.locator('tbody tr').filter({ hasText: 'Studente Prova Popup' });
  await row.getByRole('button', { name: /Modifica riga/ }).click();
  const edit = page.getByRole('dialog', { name: 'Modifica studente' });
  await expect(edit).toBeVisible();
  await edit.getByLabel('Ciurma', { exact: true }).fill('Nuova ciurma');
  await edit.getByRole('button', { name: 'Annulla' }).click();
  await expect(row).toContainText('Equipaggio');
  await row.getByRole('button', { name: /Modifica riga/ }).click();
  await edit.getByLabel('Ciurma', { exact: true }).fill('Nuova ciurma');
  await edit.getByRole('button', { name: 'Salva riga' }).click();
  await expect(edit).toHaveCount(0);
  await expect(row).toContainText('Nuova ciurma');
  await row.getByRole('button', { name: /Elimina riga/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Elimina studente dal Planning' });
  await expect(confirm).toContainText('Studente Prova Popup');
  await confirm.getByRole('button', { name: 'Annulla' }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Elimina riga/ }).click();
  await confirm.getByRole('button', { name: 'Conferma eliminazione' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(row).toHaveCount(0);
});
