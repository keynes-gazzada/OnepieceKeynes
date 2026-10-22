import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unifiedDaily } from '../lib/unified-registry';
import { dailyPoints } from '../lib/point-rules';
import type { Daily } from '../lib/registry-core';

test('merging old subject days preserves scores, fruit, notes and weapons', () => {
  const base: Daily = {
    id: 1,
    user_id: 2,
    date: '2027-03-01',
    subject: 'TePi',
    presence: 'A+',
    phone: '+',
    bug: 2,
    anxiety: 1,
    mystery: 0,
    weapon: 'Poseidon',
    multiverse: 'Prima nota',
    multiverse_points: 160,
    fruit_points: 7,
    fruit_note: 'Frutto TPSIT',
    imported_points_offset: 50,
    updated_at: '2026-10-01',
  };
  const second = {
    ...base,
    id: 2,
    subject: 'SER',
    presence: 'A',
    bug: 1,
    weapon: 'Uranus',
    multiverse: 'Seconda nota',
    multiverse_points: 80,
    fruit_points: 9,
    fruit_note: 'Frutto SER',
    imported_points_offset: 80,
  };
  const [merged] = unifiedDaily([base, second]);
  expect(dailyPoints(merged)).toBe(dailyPoints(base) + dailyPoints(second));
  expect(merged).toMatchObject({
    subject: '',
    bug: 3,
    multiverse_points: 240,
    fruit_points: 16,
    weapon: 'Poseidon, Uranus',
    multiverse: 'Prima nota\nSeconda nota',
  });
  expect(unifiedDaily([merged])[0]).toEqual(merged);
});

test('legacy imports keep exact balances and reject edits without a subject', async ({
  request,
}) => {
  await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const date = '2027-03-01';
  const total = async () =>
    (await (await request.get(`/api/data?date=${date}&totalsOnly=1`)).json()).totals[2];
  const before = await total();
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Update').addRows([
    ['Mail', 'Data', 'Presenza', 'Telefono', 'Bug', 'Ansia', 'Frutti', 'Note', 'Materia'],
    ['studentessa@demo.local', date, 'A+', '+', 2, 1, 7, 'Frutto TPSIT', 'TPSIT'],
    ['studentessa@demo.local', date, 'A', '+', 1, 1, 9, 'Frutto SER', 'SER'],
  ]);
  expect(
    (
      await request.post('/api/admin/upload', {
        multipart: {
          mode: 'update',
          file: {
            name: 'Legacy.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from(await book.xlsx.writeBuffer()),
          },
        },
      })
    ).status(),
  ).toBe(200);
  expect(await total()).toBe(before + 46);
  const data = await (await request.get(`/api/data?date=${date}`)).json();
  const row = data.daily.find((r: Daily) => r.user_id === 2);
  expect(row).toMatchObject({ bug: 3, fruit_points: 16, presence: 'A+', subject: '' });
  const again = await request.post('/api/admin/upload', {
    multipart: {
      mode: 'update',
      file: {
        name: 'Legacy.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await book.xlsx.writeBuffer()),
      },
    },
  });
  expect(again.status()).toBe(200);
  expect(await total()).toBe(before + 46);
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(
      (await request.post('/api/admin/registry', { data: { date, rows: [row] } })).status(),
    ).toBe(400);
    expect(await total()).toBe(before + 46);
  }
  expect(
    (
      await request.post('/api/admin/registry', {
        data: {
          date,
          subject: 'TPSIT',
          rows: [{ user_id: 2, presence: 'P', phone: '', bug: 1, multiverse_points: 240 }],
        },
      })
    ).status(),
  ).toBe(200);
  expect(await total()).toBe(before + 336);
  const stored = (await (await request.get(`/api/data?date=${date}`)).json()).daily.find(
    (r: Daily) => r.user_id === 2,
  );
  expect(stored.fruit_note).toBe('Frutto TPSIT\nFrutto SER');
  for (const patch of [{ bug: -1 }, { bug: 1.5 }, { multiverse_points: 81 }]) {
    expect(
      (
        await request.post('/api/admin/registry', {
          data: { date, subject: 'TPSIT', rows: [{ ...row, ...patch }] },
        })
      ).status(),
    ).toBe(400);
  }
  expect(
    (
      await request.post('/api/admin/grade', {
        data: { user_id: 2, date, type: 'interrogazione', grade: 8 },
      })
    ).status(),
  ).toBe(400);
});

test('subject labels and filters cannot split imports, profiles or rankings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const date = '2027-03-10';
  const book = new ExcelJS.Workbook();
  book.addWorksheet('One Piece').addRows([
    ['Data', 'Rotta', 'Classe', 'Pirata', 'Tipologia', 'Punti', 'Voto', 'Materia'],
    [new Date(`${date}T12:00:00Z`), 1, '3CI', 'ROSSI NAMI', 'Bug', 40, null, 'TPSIT'],
    [new Date(`${date}T12:00:00Z`), 1, '3CI', 'ROSSI NAMI', 'Bug', 60, null, 'SER'],
    [new Date(`${date}T12:00:00Z`), 1, '3CI', 'ROSSI NAMI', 'Bug', 20, null, 'qualsiasi valore'],
    [new Date(`${date}T12:00:00Z`), 1, '3CI', 'ROSSI NAMI', 'Bug', 30],
  ]);
  expect(
    (
      await page.request.post('/api/admin/upload', {
        multipart: {
          mode: 'details',
          file: {
            name: 'Unified.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from(await book.xlsx.writeBuffer()),
          },
        },
      })
    ).status(),
  ).toBe(200);
  const first = await (await page.request.get(`/api/data?date=${date}&subject=TPSIT`)).json();
  const second = await (await page.request.get(`/api/data?date=${date}&subject=SER`)).json();
  expect(first).toEqual(second);
  expect(first.importedPoints[2]).toBe(150);
  expect(
    (
      await page.request.post('/api/admin/registry', {
        data: { date, subject: 'TPSIT', rows: [{ user_id: 2, presence: 'P', phone: '', bug: 0 }] },
      })
    ).status(),
  ).toBe(200);
  const score = (await (await page.request.get(`/api/data?date=${date}&totalsOnly=1`)).json())
    .totals[2];
  let adminRanking: string[] | undefined;
  for (const subject of ['TPSIT', 'SER']) {
    await page.goto(`/narratore?classe=3CI&materia=${subject}`);
    await expect(page.locator('.registry-table')).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Registro punti · 3CI', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.registry-tabs')).toHaveCount(0);
    await expect(page.getByLabel('Materia', { exact: true })).toHaveValue(subject);
    await page.goto(`/viaggio?classe=3CI&materia=${subject}`);
    await expect(page.locator('.leaderboard')).toHaveCount(1);
    const ranking = await page.locator('.leader-row').allTextContents();
    if (adminRanking) expect(ranking).toEqual(adminRanking);
    else adminRanking = ranking;
  }
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
      })
    ).status(),
  ).toBe(200);
  for (const subject of ['TPSIT', 'SER']) {
    await page.goto(`/profilo?materia=${subject}`);
    await expect(page.getByRole('navigation', { name: 'Materie', exact: true })).toHaveCount(0);
    await expect(page.locator('.profile-balance > strong')).toHaveText(
      `${new Intl.NumberFormat('it-IT').format(score)} ฿`,
    );
    await page.getByRole('button', { name: /La tua taglia/ }).click();
    await expect(page.getByRole('dialog')).not.toContainText(/TPSIT|SER|Registro precedente/);
    const day = page
      .getByRole('dialog')
      .getByRole('row')
      .filter({ hasText: 'Giornata' })
      .filter({ hasText: /10\/0?3\/2027/ });
    await expect(day).toHaveCount(1);
    await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).click();
    await page.goto(`/viaggio?materia=${subject}`);
    await expect(page.locator('.leaderboard')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Materie', exact: true })).toHaveCount(0);
    await expect(
      page.locator('.leader-row').filter({ hasText: 'Rossi Nami' }).locator('.leader-score'),
    ).toHaveText(`${new Intl.NumberFormat('it-IT').format(score)} ฿`);
  }
});

test('bulk columns respect crew filters and multiple bugs and multiverses persist', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/narratore?classe=3CI&materia=TPSIT');
  await page.getByLabel('Data', { exact: true }).fill('2027-03-02');
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  await page.getByLabel('Seleziona tutte le presenze').check();
  await page.getByLabel('Seleziona tutti i telefoni').check();
  await expect(page.getByLabel('Presenza di Nami')).toHaveValue('P');
  await page.getByLabel('Presenza di Nami').selectOption('A');
  expect(
    await page
      .getByLabel('Seleziona tutte le presenze')
      .evaluate((node: HTMLInputElement) => node.indeterminate),
  ).toBe(true);
  await page.getByLabel('Seleziona tutte le presenze').check();
  await page.getByLabel('Ciurma', { exact: true }).selectOption('1');
  await page.getByLabel('Seleziona tutti i telefoni').uncheck();
  await page.getByLabel('Ciurma', { exact: true }).selectOption('');
  await expect(page.getByLabel('Telefono di Nami')).toHaveValue('');
  await expect(page.getByLabel('Telefono di Marta')).toHaveValue('+');
  await page.getByLabel('Bug di Nami').fill('3');
  const row = page.locator('.registry-table tbody tr').filter({ hasText: 'Rossi Nami' });
  await row.locator('td').nth(8).getByRole('button').click();
  await page.getByLabel('Numero di multiversi').fill('2');
  await page.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(row.locator('td').nth(11)).toHaveText('310');
  await page.getByRole('button', { name: 'Salva registro', exact: true }).click();
  await expect(page.locator('.registry-section [role="status"]')).toContainText('salvato');
  await page.reload();
  await expect(page.getByLabel('Bug di Nami')).toHaveValue('3');
  await expect(row.locator('td').nth(11)).toHaveText('310');
  await row.locator('td').nth(10).getByRole('button').click();
  await expect(
    page.getByRole('dialog').getByRole('option', { name: 'interrogazione' }),
  ).toHaveCount(0);
});

test('new days select attendance and phones and keep saved individual corrections', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/narratore?classe=3CI&data=2027-03-03&materia=TPSIT');
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Seleziona tutte le presenze')).toBeChecked();
  await expect(page.getByLabel('Seleziona tutti i telefoni')).toBeChecked();
  const presences = page.getByLabel(/^Presenza di /);
  const phones = page.getByLabel(/^Telefono di /);
  expect(await presences.count()).toBeGreaterThan(0);
  for (const presence of await presences.all()) await expect(presence).toHaveValue('P');
  for (const phone of await phones.all()) await expect(phone).toHaveValue('+');

  await page.getByLabel('Presenza di Nami').selectOption('A');
  await page.getByLabel('Telefono di Nami').selectOption('');
  await page.getByLabel('Presenza di Marta').selectOption('');
  await page.getByLabel('Telefono di Marta').selectOption('');
  await page.getByRole('button', { name: 'Salva registro', exact: true }).click();
  await expect(page.locator('.registry-section [role="status"]')).toContainText('salvato');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Presenza di Nami')).toHaveValue('A');
  await expect(page.getByLabel('Telefono di Nami')).toHaveValue('');
  await expect(page.getByLabel('Presenza di Marta')).toHaveValue('');
  await expect(page.getByLabel('Telefono di Marta')).toHaveValue('');

  await page.getByLabel('Data', { exact: true }).fill('2027-03-04');
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Seleziona tutte le presenze')).toBeChecked();
  await expect(page.getByLabel('Seleziona tutti i telefoni')).toBeChecked();
});

test('admin rankings include all classes while student class access remains restricted', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const roster = new ExcelJS.Workbook();
  roster.addWorksheet('Studenti').addRows([
    ['Classe', 'Nr.', 'Alunno/a', 'Ciurma'],
    ['4CI', 1, 'CLASSIFICA QUARTA', 'Quarta'],
  ]);
  expect(
    (
      await page.request.post('/api/admin/upload', {
        multipart: {
          mode: 'details',
          file: {
            name: 'Ranking.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from(await roster.xlsx.writeBuffer()),
          },
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/viaggio');
  await expect(page.getByLabel('Classe della classifica')).toHaveValue('');
  await expect(page.locator('.leader-row').filter({ hasText: 'Rossi Nami' })).toBeVisible();
  await expect(page.locator('.leader-row').filter({ hasText: 'Verdi Marta' })).toBeVisible();
  await expect(page.locator('.leader-name').filter({ hasText: '4CI ·' }).first()).toBeVisible();
  const scores = await page.locator('.leader-score').allTextContents();
  const values = scores.map((s) => Number(s.replace(/[^0-9-]/g, '')));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await page.getByLabel('Classe della classifica').selectOption('4CI');
  await page.getByRole('button', { name: 'Applica' }).click();
  await expect(page.locator('.leader-row').filter({ hasText: 'Rossi Nami' })).toHaveCount(0);
  await page.request.post('/api/auth/login', {
    data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/viaggio?classe=4CI&materia=SER');
  await expect(page.getByLabel('Classe della classifica')).toHaveCount(0);
  await expect(page.locator('.leader-name').filter({ hasText: '4CI ·' })).toHaveCount(0);
  await expect(page.locator('.leader-row').filter({ hasText: 'Rossi Nami' })).toBeVisible();
});

test('user details support search, registration filters and keyboard access on desktop and phones', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const roster = new ExcelJS.Workbook();
  roster.addWorksheet('Studenti').addRows([
    ['Classe', 'Nr.', 'Alunno/a', 'Ciurma'],
    ['5CI', 1, 'DETTAGLI NUOVO', 'Dettagli'],
  ]);
  const upload = await page.request.post('/api/admin/upload', {
    multipart: {
      mode: 'details',
      file: {
        name: 'Studenti.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await roster.xlsx.writeBuffer()),
      },
    },
  });
  expect(upload.status()).toBe(200);
  await page.goto('/narratore?classe=3CI');
  const trigger = page.getByRole('button', { name: 'Apri dettagli utenti', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Dettagli utenti', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Cerca utenti').fill('Rossi Nami');
  await expect(dialog.locator('.admin-user-list > li')).toHaveCount(1);
  await expect(dialog).toContainText('studentessa@demo.local');
  await expect(dialog).toContainText('3CI');
  await dialog.getByLabel('Cerca utenti').fill('nessun-utente-corrisponde');
  await expect(dialog).toContainText('Nessun utente corrisponde ai filtri.');
  await dialog.getByLabel('Cerca utenti').fill('');
  await dialog.getByLabel('Stato utenti').selectOption('narrators');
  await expect(dialog).toContainText('narratore@demo.local');
  await expect(dialog).not.toContainText('studentessa@demo.local');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.getByLabel('Classe', { exact: true }).selectOption('5CI');
  await trigger.click();
  await dialog.getByLabel('Stato utenti').selectOption('unregistered');
  await expect(dialog.locator('.admin-user-list > li')).toHaveCount(1);
  await expect(dialog).toContainText('Dettagli Nuovo');
  await expect(dialog).not.toContainText('@studenti.invalid');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.screenshot({ path: join(tmpdir(), 'keynes-user-details.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await dialog.screenshot({ path: join(tmpdir(), 'keynes-user-details-mobile.png') });
  await dialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
});

test('route details open without a selected class and allow choosing one inside the popup', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/narratore?classe=3CI');
  await page.getByLabel('Classe', { exact: true }).selectOption('');
  const trigger = page.getByRole('button', { name: 'Apri dettagli rotte', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Dettagli rotte', exact: true });
  await expect(dialog).toContainText('Seleziona una classe per modificare le rotte.');
  await dialog.getByLabel('Classe delle rotte').selectOption('3CI');
  await dialog.getByLabel('Anno delle rotte').selectOption('1');
  await expect(dialog.getByLabel('Nome rotta 1, anno 1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Classe', { exact: true })).toHaveValue('');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.screenshot({ path: join(tmpdir(), 'keynes-route-details.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await dialog.screenshot({ path: join(tmpdir(), 'keynes-route-details-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('routes and custom roles can be edited without choosing a crew; mystery notices stay below mysteries', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/narratore?classe=3CI');
  await page.getByRole('button', { name: 'Apri dettagli rotte', exact: true }).click();
  await page.getByLabel('Anno delle rotte').selectOption('1');
  await page.getByLabel('Nome rotta 1, anno 1', { exact: true }).fill('Rotta modificata dal sito');
  await page.getByLabel('Inizio rotta 1, anno 1', { exact: true }).fill('2024-09-02');
  await page.getByRole('button', { name: 'Salva rotta 1, anno 1', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Rotta aggiornata.');
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).click();
  await page.getByLabel('Ruolo di Nami Rossi', { exact: true }).fill('Cartografa');
  await page.getByRole('button', { name: 'Salva ruolo di Nami Rossi', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Ruolo aggiornato.');
  await page.reload();
  await page.getByRole('button', { name: 'Apri dettagli rotte', exact: true }).click();
  await expect(page.getByLabel('Nome rotta 1, anno 1', { exact: true })).toHaveValue(
    'Rotta modificata dal sito',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(page.getByLabel('Ruolo di Nami Rossi', { exact: true })).toHaveValue('Cartografa');
  await page.getByLabel('Titolo nuovo mistero').fill('Mistero da eliminare');
  await page.getByRole('button', { name: 'Aggiungi mistero', exact: true }).click();
  const mysteries = page.locator('.admin-mysteries');
  await expect(mysteries.getByRole('status')).toHaveText('Mistero aggiunto.');
  await expect(page.locator('.registry-section [role="status"]')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Elimina mistero Mistero da eliminare', exact: true })
    .click();
  await page.getByRole('button', { name: 'Conferma eliminazione' }).click();
  await expect(mysteries.getByRole('status')).toHaveText('Mistero eliminato.');
  await page.reload();
  await expect(mysteries.getByText('Mistero da eliminare', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('.admin-overview')
    .screenshot({ path: join(tmpdir(), 'keynes-admin-management.png') });
  await page
    .locator('.registry-section')
    .screenshot({ path: join(tmpdir(), 'keynes-unified-register.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('.admin-overview')
    .screenshot({ path: join(tmpdir(), 'keynes-admin-management-mobile.png') });
});
