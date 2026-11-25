import { expect, test } from '@playwright/test';
import { DEFAULT_SCORING } from '../lib/point-rules';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const credentials = { email: 'narratore@demo.local', password: 'Demo1234!' };

test('bulk grades are atomic, return real IDs and update totals after correction and deletion', async ({
  request,
}) => {
  await request.post('/api/auth/login', { data: credentials });
  const read = async () => await (await request.get('/api/data?student=2')).json();
  const before = await read();
  const data = {
    date: '2028-03-15',
    type: 'verifica',
    entries: [
      { user_id: 2, grade: 8 },
      { user_id: 3, grade: 7.5 },
    ],
  };
  expect(
    (
      await request.post('/api/admin/grade-bulk', {
        data: { ...data, entries: [...data.entries, { user_id: 4, grade: 11 }] },
      })
    ).status(),
  ).toBe(400);
  expect((await read()).total).toBe(before.total);
  const response = await request.post('/api/admin/grade-bulk', { data });
  expect(response.ok()).toBe(true);
  const { grades } = await response.json();
  expect(grades).toHaveLength(2);
  expect(grades[0].id).toBeGreaterThan(0);
  expect((await read()).total).toBe(before.total + 1600);
  try {
    expect(
      (
        await request.post('/api/admin/grade-update', {
          data: { ...grades[0], grade: 9, date: '2028-03-16', type: 'progetto' },
        })
      ).ok(),
    ).toBe(true);
    const changed = await read();
    expect(changed.grades.find((g: { id: number }) => g.id === grades[0].id)).toMatchObject({
      date: '2028-03-16',
      grade: 9,
      type: 'progetto',
      points: 900,
    });
    expect(changed.total).toBe(before.total + 900);
    expect(
      changed.movements.reduce((sum: number, m: { points: number }) => sum + m.points, 0),
    ).toBe(changed.total);
  } finally {
    for (const g of grades)
      expect((await request.post('/api/admin/grade-delete', { data: { id: g.id } })).ok()).toBe(
        true,
      );
  }
  expect((await read()).total).toBe(before.total);
});

test('configurable scoring counts all anxiety episodes and student details respect privacy', async ({
  request,
  browser,
}) => {
  await request.post('/api/auth/login', { data: credentials });
  const date = '2028-03-17';
  const settings = {
    daily: { ...DEFAULT_SCORING.daily, bug: 70, anxiety: -20 },
    grades: { verifica: 250, progetto: 125 },
  };
  const read = async () => await (await request.get('/api/data?student=2')).json();
  let gradeId: number | undefined;
  try {
    expect(
      (
        await request.post('/api/admin/point-rules', {
          data: { settings: { ...settings, daily: { ...settings.daily, multiverse: 0 } } },
        })
      ).status(),
    ).toBe(400);
    expect((await request.post('/api/admin/point-rules', { data: { settings } })).ok()).toBe(true);
    const before = (await read()).total;
    expect(
      (
        await request.post('/api/admin/registry', {
          data: {
            date,
            subject: 'TPSIT',
            rows: [{ user_id: 2, presence: 'P', phone: '', bug: 3, anxiety: 2 }],
          },
        })
      ).ok(),
    ).toBe(true);
    const saved = await (await request.get(`/api/data?date=${date}&subject=TPSIT`)).json();
    expect(saved.daily.find((r: { user_id: number }) => r.user_id === 2).anxiety).toBe(2);
    const inserted = await (
      await request.post('/api/admin/grade', {
        data: { date, type: 'verifica', user_id: 2, grade: 8 },
      })
    ).json();
    gradeId = inserted.grade.id;
    expect(inserted.points).toBe(2000);
    expect(
      (
        await request.post('/api/admin/extra-points', {
          data: { date, user_id: 2, points: 45, reason: 'Attività aggiuntiva' },
        })
      ).status(),
    ).toBe(201);
    const details = await read();
    expect(details.total).toBe(before + 210 - 40 + 2000 + 45);
    const ranking = await (await request.get(`/api/data?date=${date}&totalsOnly=1`)).json();
    expect(ranking.totals[2]).toBe(details.total);
    expect(
      details.movements
        .filter((m: { date: string }) => m.date === date)
        .map((m: { points: number }) => m.points)
        .sort((a: number, b: number) => a - b),
    ).toEqual([-40, 45, 210, 2000]);
    const student = await browser.newContext();
    try {
      await student.request.post('/api/auth/login', {
        data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
      });
      expect((await student.request.get('/api/data?student=2')).ok()).toBe(true);
      expect((await student.request.get('/api/data?student=3')).status()).toBe(403);
      for (const action of [
        'point-rules',
        'grade-bulk',
        'grade-update',
        'grade-delete',
        'user-update',
        'user-delete',
        'extra-points',
        'route-create',
      ])
        expect((await student.request.post(`/api/admin/${action}`, { data: {} })).status()).toBe(
          403,
        );
    } finally {
      await student.close();
    }
  } finally {
    await request.post('/api/admin/point-rules', { data: { settings: DEFAULT_SCORING } });
    if (gradeId) await request.post('/api/admin/grade-delete', { data: { id: gradeId } });
    await request.post('/api/admin/registry', {
      data: {
        date,
        subject: 'TPSIT',
        rows: [{ user_id: 2, presence: 'P', phone: '', bug: 0, anxiety: 0 }],
      },
    });
  }
});

test('grade window supports Tab, corrections, deletion and extra points without losing registry drafts', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.request.post('/api/auth/login', { data: credentials });
  await page.goto('/narratore?classe=3CI&materia=TPSIT&data=2028-04-01');
  await page.getByLabel('Ciurma', { exact: true }).selectOption('1');
  await page.getByLabel('Bug di Nami', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Voti della classe', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const inputs = dialog.locator('.bulk-grade-input');
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).fill('8,5');
  await page.keyboard.press('Tab');
  await expect(inputs.nth(1)).toBeFocused();
  await inputs.nth(1).fill('7');
  await dialog.getByRole('button', { name: 'Salva 2 voti' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Bug di Nami', { exact: true })).toHaveValue('2');
  const row = page.locator('.registry-table tbody tr').filter({ hasText: 'Rossi Nami' });
  await row.getByRole('button', { name: 'Dettagli', exact: true }).click();
  await expect(dialog.getByRole('tab', { name: 'Voti', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const gradeRow = dialog.locator('tbody tr').filter({ hasText: '2028-04-01' });
  await gradeRow.getByRole('button', { name: /^Modifica voto/ }).click();
  await dialog.getByLabel('Voto', { exact: true }).fill('9');
  await dialog.getByRole('button', { name: 'Salva modifica voto' }).click();
  await expect(gradeRow.locator('td').nth(2)).toHaveText('9');
  await gradeRow.getByRole('button', { name: /^Elimina voto/ }).click();
  await dialog.getByRole('button', { name: 'Conferma eliminazione voto' }).click();
  await expect(gradeRow).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Movimenti', exact: true }).click();
  await dialog.getByLabel('Motivazione', { exact: true }).fill('Aiuto alla classe');
  await dialog.getByLabel('Punti extra', { exact: true }).fill('25');
  await dialog.getByRole('button', { name: 'Aggiungi punti extra', exact: true }).click();
  await expect(
    dialog.getByRole('cell', { name: 'Extra · Aiuto alla classe', exact: true }),
  ).toBeVisible();
  await dialog.screenshot({ path: join(tmpdir(), 'keynes-student-points.png') });
  await dialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(page.getByLabel('Bug di Nami', { exact: true })).toHaveValue('2');
  await expect(row.locator('.registry-crew .crew-emblem')).toBeVisible();
});

test('narrators create routes and edit or delete accounts while keeping their own account', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', { data: credentials });
  await page.goto('/narratore?classe=3CI');
  await page.getByRole('button', { name: 'Apri dettagli rotte' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('summary').filter({ hasText: 'Aggiungi rotta' }).click();
  await dialog.getByLabel('Nome rotta', { exact: true }).fill('Nuova rotta di prova');
  await dialog.getByLabel('Anno', { exact: true }).fill('8');
  await dialog.getByLabel('Numero rotta', { exact: true }).fill('5');
  await dialog.getByLabel('Dal', { exact: true }).first().fill('2028-01-01');
  await dialog.getByLabel('Al', { exact: true }).first().fill('2028-02-01');
  await dialog.getByRole('button', { name: 'Crea rotta', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Rotta creata.');
  await dialog
    .getByLabel('Nome rotta 5, anno 8', { exact: true })
    .fill('Rotta aggiornata di prova');
  await dialog.getByRole('button', { name: 'Salva rotta 5, anno 8', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Rotta aggiornata.');
  await dialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
  const account = {
    first: 'Gestione',
    last: 'Utenti',
    email: 'gestione.utenti@isiskeynes.it',
    password: 'Gestione123!',
    confirm: 'Gestione123!',
  };
  expect((await page.request.post('/api/admin/create-admin', { data: account })).status()).toBe(
    201,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Apri dettagli utenti' }).click();
  const userCard = dialog
    .locator('li')
    .filter({ has: page.getByRole('heading', { name: 'Utenti Gestione', exact: true }) });
  await userCard.getByRole('button', { name: 'Modifica utente' }).click();
  await userCard.getByLabel('Nome', { exact: true }).fill('Gestione modificata');
  await userCard.getByRole('button', { name: 'Salva utente', exact: true }).click();
  const edited = dialog.locator('li').filter({
    has: page.getByRole('heading', { name: 'Utenti Gestione modificata', exact: true }),
  });
  await expect(edited).toBeVisible();
  await edited.getByRole('button', { name: 'Elimina utente', exact: true }).click();
  await edited.getByRole('button', { name: 'Conferma eliminazione utente', exact: true }).click();
  await expect(edited).toHaveCount(0);
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { email: account.email, password: account.password },
      })
    ).status(),
  ).toBe(401);
  expect((await page.request.post('/api/admin/user-delete', { data: { id: 1 } })).status()).toBe(
    400,
  );
});

test('rules are framed and justified, scoring settings persist and the eye toggles mystery visibility on phones', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/regole');
  await expect(page.locator('.rules-body')).toHaveCSS('border-top-style', 'double');
  await expect(page.locator('.rules-chapter p').first()).toHaveCSS('text-align', 'justify');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), 'keynes-rules-mobile.png'), fullPage: true });
  await page.request.post('/api/auth/login', { data: credentials });
  try {
    await page.goto('/narratore?classe=3CI&materia=TPSIT');
    await page.getByRole('button', { name: 'Punteggi', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Punti per episodio di ansia', { exact: true }).fill('-35');
    await dialog.getByRole('button', { name: 'Salva punteggi', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Punteggi', exact: true }).click();
    await expect(dialog.getByLabel('Punti per episodio di ansia', { exact: true })).toHaveValue(
      '-35',
    );
    await dialog.evaluate((node) => {
      node.scrollTop = 0;
    });
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await dialog.screenshot({ path: join(tmpdir(), 'keynes-scoring-mobile.png') });
    await dialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
    await page.getByRole('button', { name: 'Misteri', exact: true }).click();
    const toggle = page.getByRole('button', {
      name: 'Mostra mistero Il faro scomparso',
      exact: true,
    });
    await toggle.click();
    await expect(
      page.getByRole('button', { name: 'Nascondi mistero Il faro scomparso', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Nascondi mistero Il faro scomparso', exact: true })
      .click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await page.request.post('/api/admin/point-rules', { data: { settings: DEFAULT_SCORING } });
    await page.request.post('/api/admin/mystery', { data: { id: 1, revealed: false } });
  }
});
