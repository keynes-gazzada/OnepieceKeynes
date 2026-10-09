import { expect, test } from '@playwright/test';

for (const width of [375, 900]) {
  test(`the navbar collapses into a dropdown at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
    await expect(nav.getByRole('link', { name: 'Accedi', exact: true })).toBeHidden();
    await nav.getByRole('button', { name: 'Apri menu' }).click();
    await expect(nav.getByRole('button', { name: 'Chiudi menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(nav.getByRole('link', { name: 'Accedi', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav.getByRole('button', { name: 'Apri menu' })).toBeFocused();
    await expect(nav.getByRole('link', { name: 'Accedi', exact: true })).toBeHidden();
    await nav.getByRole('button', { name: 'Apri menu' }).click();
    await nav.getByRole('link', { name: 'Accedi', exact: true }).click();
    await expect(page).toHaveURL(/\/accedi$/);
    await expect(nav.getByRole('button', { name: 'Apri menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(nav.getByRole('button', { name: 'Apri menu' })).toBeHidden();
    await expect(nav.getByRole('link', { name: 'Accedi', exact: true })).toBeVisible();
  });
}

test('the mobile narrator menu includes classes, subjects and sign out', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/accedi');
  await page.locator('input[name="email"]').fill('narratore@demo.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(/\/narratore$/);
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
  await expect(nav.getByRole('button', { name: 'Esci', exact: true })).toBeHidden();
  await nav.getByRole('button', { name: 'Apri menu' }).click();
  await expect(nav.getByRole('button', { name: 'Esci', exact: true })).toBeVisible();
  await nav.locator('.nav-classes summary').click();
  await nav
    .getByRole('list', { name: 'Materie 4CI' })
    .getByRole('link', { name: 'SER', exact: true })
    .click();
  await expect(page).toHaveURL(/\/narratore\?classe=4CI&materia=SER/);
  await expect(nav.getByRole('button', { name: 'Apri menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(
    page.getByRole('heading', { name: 'Registro SER · 4CI', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
