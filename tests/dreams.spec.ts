import { expect, test } from '@playwright/test';

test('dreams are managed separately from multiverse entries', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = page.request;
  expect(
    (
      await api.post('/api/admin/dream-save', { data: { user_id: 2, text: 'Non autorizzato' } })
    ).status(),
  ).toBe(403);
  await api.post('/api/auth/login', {
    data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
  });
  expect((await api.post('/api/admin/dream-delete', { data: { id: 1 } })).status()).toBe(403);
  await api.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  expect(
    (await api.post('/api/admin/dream-save', { data: { user_id: 2, text: '   ' } })).status(),
  ).toBe(400);
  expect(
    (await api.post('/api/admin/dream-save', { data: { user_id: -1, text: 'Sogno' } })).status(),
  ).toBe(400);
  const register = await api.post('/api/admin/registry', {
    data: {
      date: '2026-10-09',
      subject: 'TePi',
      rows: [
        {
          user_id: 2,
          presence: 'A',
          phone: '',
          multiverse: 'Multiverso riservato al registro',
          multiverse_points: 0,
        },
      ],
    },
  });
  expect(register.status()).toBe(200);
  await page.goto('/');
  await expect(page.locator('.home-stories')).not.toContainText('Multiverso riservato al registro');
  await page.goto('/narratore?classe=3CI&materia=TPSIT');
  await expect(page.locator('#sogni')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Gestisci sogni' })).toHaveCount(0);
  const headings = await page.locator('.registry-table th').allTextContents();
  expect(headings.indexOf('Sogno')).toBe(headings.indexOf('Multiverso') + 1);
  const dreamButton = page.getByRole('button', { name: 'Sogni di Nami Rossi', exact: true });
  await expect(dreamButton).toHaveText('Dettagli');
  await dreamButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Nami Rossi');
  await expect(dialog).not.toContainText('Diventare il capitano');
  await dialog.getByRole('button', { name: 'Aggiungi sogno', exact: true }).click();
  await dialog.getByLabel('Sogno', { exact: true }).fill('Un sogno da pubblicare nella home');
  await dialog.getByRole('button', { name: 'Salva sogno' }).click();
  const card = dialog.locator('article').filter({ hasText: 'Un sogno da pubblicare nella home' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Modifica sogno/ }).click();
  await dialog.getByLabel('Sogno', { exact: true }).fill('Il sogno aggiornato nella home');
  await dialog.getByRole('button', { name: 'Salva sogno' }).click();
  await dialog.getByRole('button', { name: /Chiudi/ }).click();
  await page.goto('/');
  await expect(page.locator('.home-stories')).toContainText('Il sogno aggiornato nella home');
  await page.goto('/narratore?classe=3CI&materia=TPSIT');
  await dreamButton.click();
  await dialog
    .locator('article')
    .filter({ hasText: 'Il sogno aggiornato nella home' })
    .getByRole('button', { name: /Elimina sogno/ })
    .click();
  await dialog.getByRole('button', { name: 'Conferma eliminazione' }).click();
  await expect(dialog).not.toContainText('Il sogno aggiornato nella home');
  await dialog.getByRole('button', { name: /Chiudi/ }).click();
  // Clear only the isolated test database to verify the empty-home behavior.
  for (const student of ['Nami Rossi', 'Luca Bianchi', 'Marta Verdi']) {
    await page.getByRole('button', { name: `Sogni di ${student}`, exact: true }).click();
    while (await dialog.locator('article').count()) {
      await dialog
        .locator('article')
        .first()
        .getByRole('button', { name: /Elimina sogno/ })
        .click();
      await dialog.getByRole('button', { name: 'Conferma eliminazione' }).click();
      await expect(dialog.getByRole('heading', { name: 'Sogni dello studente' })).toBeVisible();
    }
    await dialog.getByRole('button', { name: /Chiudi/ }).click();
    await expect(page.getByRole('button', { name: `Sogni di ${student}`, exact: true })).toHaveText(
      'Aggiungi',
    );
  }
  await dreamButton.click();
  await expect(dialog.getByRole('heading', { name: 'Aggiungi sogno' })).toBeVisible();
  await dialog.getByRole('button', { name: /Chiudi/ }).click();
  await page.goto('/narratore?classe=3CI&materia=storico');
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeDisabled();
  await page.getByLabel('Materia', { exact: true }).selectOption('TPSIT');
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  await dreamButton.click();
  await expect(dialog.getByLabel('Sogno', { exact: true })).toBeEnabled();
  await page.goto('/');
  await expect(page.locator('.home-stories')).toHaveCount(0);
  await expect(page.getByText('I primi sogni arriveranno presto.')).toHaveCount(0);
  // Restore the test's attendance entry so other registry tests start without this absence.
  expect(
    (
      await api.post('/api/admin/registry', {
        data: {
          date: '2026-10-09',
          subject: 'TePi',
          rows: [{ user_id: 2, presence: 'P', phone: '' }],
        },
      })
    ).status(),
  ).toBe(200);
});

test('dream points update the register and rankings without duplicate points in the unified register', async ({
  page,
  browser,
}) => {
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  for (const points of [-2, 1, 3, 6, '4']) {
    expect(
      (
        await page.request.post('/api/admin/dream-save', {
          data: { user_id: 2, text: 'Punti invalidi', points, date: '2026-10-06', subject: 'TePi' },
        })
      ).status(),
    ).toBe(400);
  }
  expect(
    (
      await page.request.post('/api/admin/dream-save', {
        data: { user_id: 2, text: 'Data mancante', points: 2 },
      })
    ).status(),
  ).toBe(400);
  const student = await browser.newContext();
  await student.request.post('http://localhost:3101/api/auth/login', {
    data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
  });
  const profile = await student.newPage();
  async function balance(subject: string) {
    await profile.goto(`http://localhost:3101/profilo?materia=${subject}`);
    return Number(
      (await profile.locator('.profile-balance > strong').innerText()).replace(/[^0-9-]/g, ''),
    );
  }
  const base = await balance('TePi');
  const otherBase = await balance('SER');
  await page.goto('/narratore?classe=3CI&materia=TePi');
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  const row = page.locator('.registry-table tr').filter({ hasText: 'Rossi Nami' });
  const total = row.locator('td').last().locator('strong');
  const baseTotal = Number(await total.innerText());
  const dreamsButton = row.getByRole('button', { name: 'Sogni di Nami Rossi', exact: true });
  await dreamsButton.click();
  const dialog = page.getByRole('dialog');
  if (await dialog.getByRole('button', { name: 'Aggiungi sogno', exact: true }).count())
    await dialog.getByRole('button', { name: 'Aggiungi sogno', exact: true }).click();
  await dialog.getByLabel('Sogno', { exact: true }).fill('Sogno con punti di verifica');
  await dialog.getByLabel('Punti sogno', { exact: true }).selectOption('2');
  await dialog.getByRole('button', { name: 'Salva sogno' }).click();
  const card = dialog.locator('article').filter({ hasText: 'Sogno con punti di verifica' });
  await expect(card).toContainText('+2 punti');
  await expect(total).toHaveText(String(baseTotal + 2));
  expect(await balance('TePi')).toBe(base + 2);
  expect(await balance('SER')).toBe(otherBase + 2);
  for (const points of [4, 4, 0, 4]) {
    await card.getByRole('button', { name: /Modifica sogno/ }).click();
    await dialog.getByLabel('Punti sogno', { exact: true }).selectOption(String(points));
    await dialog.getByRole('button', { name: 'Salva sogno' }).click();
    await expect(total).toHaveText(String(baseTotal + points));
    expect(await balance('TePi')).toBe(base + points);
  }
  await profile.goto('http://localhost:3101/viaggio?materia=TePi');
  await expect(
    profile.locator('.leader-row').filter({ hasText: 'Rossi Nami' }).locator('.leader-score'),
  ).toHaveText(`${base + 4} ฿`);
  await card.getByRole('button', { name: /Elimina sogno/ }).click();
  await dialog.getByRole('button', { name: 'Conferma eliminazione' }).click();
  await expect(total).toHaveText(String(baseTotal));
  expect(await balance('TePi')).toBe(base);
  await student.close();
});
