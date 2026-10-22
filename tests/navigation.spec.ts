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

test('the mobile narrator menu includes classes, the unified ranking and sign out', async ({
  page,
}) => {
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
  await nav.getByRole('link', { name: '4CI', exact: true }).click();
  await expect(page).toHaveURL(/\/narratore\?classe=4CI$/);
  await expect(nav.getByRole('button', { name: 'Apri menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(
    page.getByRole('heading', { name: 'Registro punti · 4CI', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

for (const width of [1440, 375]) {
  test(`login and logout immediately replace the navbar account at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
    const openMenu = async () => {
      if (width < 1025) await nav.getByRole('button', { name: 'Apri menu', exact: true }).click();
    };
    for (const account of [
      {
        email: 'studentessa@demo.local',
        name: 'Nami Rossi',
        destination: '/profilo',
        link: 'Profilo',
      },
      {
        email: 'narratore@demo.local',
        name: 'Andrea Narratore',
        destination: '/narratore',
        link: 'Narratore',
      },
    ]) {
      await openMenu();
      await expect(nav.locator('.nav-user')).toHaveCount(0);
      await nav.getByRole('link', { name: 'Accedi', exact: true }).click();
      await page.locator('input[name="email"]').fill(account.email);
      await page.locator('input[name="password"]').fill('Demo1234!');
      await page.getByRole('button', { name: 'Accedi', exact: true }).click();
      await expect(page).toHaveURL(account.destination);
      await openMenu();
      await expect(nav.locator('.nav-user')).toContainText(account.name);
      await expect(nav.getByRole('link', { name: account.link, exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Accedi', exact: true })).toHaveCount(0);
      if (width === 1440) {
        await page.goBack();
        await expect(nav.locator('.nav-user')).toContainText(account.name);
        await page.goForward();
        await expect(page).toHaveURL(account.destination);
        await expect(nav.locator('.nav-user')).toContainText(account.name);
      }
      await nav.getByRole('link', { name: 'Home', exact: true }).click();
      await expect(page).toHaveURL('/');
      await openMenu();
      await expect(nav.locator('.nav-user')).toContainText(account.name);
      await nav.getByRole('button', { name: 'Esci', exact: true }).click();
      await expect(nav.locator('.nav-user')).toHaveCount(0);
      await expect(page).toHaveURL('/');
      await openMenu();
      await expect(nav.getByRole('link', { name: 'Accedi', exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: account.link, exact: true })).toHaveCount(0);
      if (width < 1025) await page.keyboard.press('Escape');
    }
  });
}

test('a failed logout keeps the current session and the mobile menu available for retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.request.post('/api/auth/login', {
    data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
  });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
  await nav.getByRole('button', { name: 'Apri menu', exact: true }).click();
  let releaseLogout = () => {};
  const delayedLogout = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  await page.route('**/api/auth/logout', async (route) => {
    await delayedLogout;
    await route.fulfill({ status: 503, json: { error: 'Servizio non disponibile' } });
  });
  await nav.getByRole('button', { name: 'Esci', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Esci', exact: true })).toBeDisabled();
  await expect(nav.getByRole('button', { name: 'Chiudi menu', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  releaseLogout();
  await expect(nav.getByRole('alert')).toHaveText('Uscita non riuscita. Riprova.');
  await expect(nav.locator('.nav-user')).toContainText('Nami Rossi');
  await expect(nav.getByRole('button', { name: 'Esci', exact: true })).toBeEnabled();
  await page.unroute('**/api/auth/logout');
  await nav.getByRole('button', { name: 'Esci', exact: true }).click();
  await expect(nav.locator('.nav-user')).toHaveCount(0);
});

test('other open tabs update their navbar when the session changes', async ({ page, context }) => {
  const other = await context.newPage();
  try {
    await page.goto('/accedi');
    await other.goto('/');
    const otherNav = other.getByRole('navigation', { name: 'Navigazione principale' });
    await expect(otherNav.locator('.nav-user')).toHaveCount(0);
    await page.locator('input[name="email"]').fill('studentessa@demo.local');
    await page.locator('input[name="password"]').fill('Demo1234!');
    await page.getByRole('button', { name: 'Accedi', exact: true }).click();
    await expect(page).toHaveURL('/profilo');
    await expect(otherNav.locator('.nav-user')).toContainText('Nami Rossi');
    await page.getByRole('button', { name: 'Esci', exact: true }).click();
    await expect(otherNav.locator('.nav-user')).toHaveCount(0);
    await expect(otherNav.getByRole('link', { name: 'Accedi', exact: true })).toBeVisible();
  } finally {
    await other.close();
  }
});
