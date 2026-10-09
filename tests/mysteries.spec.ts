import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('students see clue progress without unrevealed titles or solutions, including on a phone', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.request.post('/api/auth/login', {
    data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/misteri');
  await expect(page.getByRole('heading', { name: 'Misteri', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mistero 01' })).toBeVisible();
  await expect(page.getByRole('list', { name: '1 indizi trovati su 4' })).toBeVisible();
  expect(await page.content()).not.toContain('Il faro scomparso');
  expect(await page.content()).not.toContain('Quattro indizi conducono al segreto');

  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .locator('main')
      .screenshot({ path: join(tmpdir(), `keynes-mysteries-${width}.png`) });
  }
});

test('four clues await the narrator, then a revealed mystery shows its solution separately', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  try {
    for (let index = 0; index < 4; index++) {
      const response = await page.request.post('/api/admin/mystery-clue', {
        data: { id: 2, index, found: true },
      });
      expect(response.ok()).toBe(true);
    }
    await page.goto('/misteri');
    await expect(
      page.getByText('Tutti gli indizi sono stati trovati.', { exact: false }),
    ).toBeVisible();
    expect(await page.content()).not.toContain('La mappa delle stelle');

    const response = await page.request.post('/api/admin/mystery', {
      data: { id: 2, revealed: true },
    });
    expect(response.ok()).toBe(true);
    await page.reload();
    const revealed = page.getByRole('region', { name: 'Svelati', exact: true });
    await expect(revealed.getByRole('heading', { name: 'La mappa delle stelle' })).toBeVisible();
    await expect(revealed).toContainText('Una rotta nascosta si rivela a chi sa osservare.');
    await expect(page.getByRole('region', { name: 'Da risolvere' })).not.toContainText(
      'Mistero 02',
    );
    await page
      .getByRole('navigation', { name: 'Sezioni dei misteri' })
      .getByRole('link', { name: 'Svelati 1' })
      .click();
    await expect(page).toHaveURL(/\/misteri#svelati$/);
    await page
      .locator('main')
      .screenshot({ path: join(tmpdir(), 'keynes-mysteries-revealed.png') });
  } finally {
    await page.request.post('/api/admin/mystery', { data: { id: 2, revealed: false } });
    for (let index = 0; index < 4; index++) {
      await page.request.post('/api/admin/mystery-clue', { data: { id: 2, index, found: false } });
    }
  }
});
