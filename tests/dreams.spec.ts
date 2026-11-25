import { expect, test } from '@playwright/test';
test('dreams are absent from the site and no longer accept writes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-stories')).toHaveCount(0);
  await page.request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/narratore?classe=3CI&materia=TPSIT');
  await expect(page.getByRole('columnheader', { name: /Sogno/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Sogni di/ })).toHaveCount(0);
  expect(
    (
      await page.request.post('/api/admin/dream-save', {
        data: { user_id: 2, text: 'Nuovo', points: 4, date: '2026-10-27' },
      })
    ).status(),
  ).toBe(404);
  await page.goto('/regole');
  await expect(page.locator('.rules-body')).not.toContainText('Sogno');
});
