import { expect, test } from '@playwright/test';

test('the rules are readable before signing in, including on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.goto('/regole');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Regole', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(2);
  await page
    .getByRole('navigation', { name: 'Indice delle regole' })
    .getByRole('link', { name: 'Classifica', exact: true })
    .click();
  await expect(page).toHaveURL(/\/regole#classifiche$/);
  await expect(page.getByRole('heading', { name: 'Classifica', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

async function signInAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/accedi');
  await page.locator('input[name="email"]').fill('studentessa@demo.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.getByRole('button', { name: 'Accedi' }).click();
}

test('the home page gives a visitor a path to sign in', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: /Il registro.*Grand Line.*della classe/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Accedi al registro', exact: true }).click();
  await expect(page).toHaveURL(/\/accedi$/);
  await expect(page.locator('input[name="email"]')).toBeVisible();
});

test('registration blocks an email absent from the roster', async ({ page }) => {
  await page.goto('/registrati');
  await page.locator('input[name="email"]').fill('s-nonpresente.altro@isiskeynes.it');
  await page.locator('input[name="password"]').fill('Student123!');
  await page.locator('input[name="confirm"]').fill('Student123!');
  await expect(page.locator('.auth-form [role="alert"]')).toContainText(
    'Non risulti nell’elenco degli studenti.',
  );
  await expect(page.getByRole('button', { name: 'Registrati', exact: true })).toBeDisabled();
  await expect(page.locator('input[name="first"]')).toHaveValue('');
});

test('a student can sign in and reach their profile', async ({ page }) => {
  await signInAsStudent(page);

  await expect(page).toHaveURL(/\/profilo$/);
  await expect(page.getByRole('heading', { name: 'La tua taglia', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rossi Nami', exact: true })).toBeVisible();
});

test('a student cannot open the narrator area', async ({ page }) => {
  await signInAsStudent(page);
  await expect(page).toHaveURL(/\/profilo$/);

  await page.goto('/narratore');

  await expect(page).toHaveURL(/\/profilo$/);
  await expect(page.getByRole('heading', { name: 'La tua taglia', exact: true })).toBeVisible();
});

test('a route that crosses New Year ends in the following calendar year', async ({ page }) => {
  await signInAsStudent(page);
  await page.getByRole('link', { name: 'Grand Line', exact: true }).click();

  await expect(page.getByText('01/11/2024 – 31/01/2025', { exact: true })).toBeVisible();
});

test('an administrator can sign in and open the narrator area', async ({ page }) => {
  await page.goto('/accedi');
  await page.locator('input[name="email"]').fill('narratore@demo.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.getByRole('button', { name: 'Accedi' }).click();

  await expect(page).toHaveURL(/\/narratore$/);
  await expect(page.getByRole('heading', { name: 'Registro punti', exact: true })).toBeVisible();

  await page.locator('.nav-classes summary').click();
  const classMenu = page.locator('.nav-classes-panel');
  await expect(classMenu).toBeVisible();
  await expect(classMenu.locator('.nav-class-group')).toHaveCount(3);
  for (const classCode of ['3CI', '4CI', '5CI']) {
    await expect(classMenu.getByRole('link', { name: classCode, exact: true })).toHaveAttribute(
      'href',
      `/narratore?classe=${classCode}`,
    );
  }
  await expect(
    page
      .getByRole('navigation', { name: 'Navigazione principale' })
      .getByRole('link', { name: 'Classifica', exact: true }),
  ).toBeVisible();
});
