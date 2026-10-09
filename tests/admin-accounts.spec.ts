import { expect, test } from '@playwright/test';

const account = {
  first: 'Nuovo',
  last: 'Docente',
  email: 'nuovo.docente@isiskeynes.it',
  password: 'Docente123!',
  confirm: 'Docente123!',
};

test('only an existing narrator can create admins with a matching teacher email', async ({
  request,
}) => {
  expect((await request.post('/api/admin/create-admin', { data: account })).status()).toBe(403);
  await request.post('/api/auth/login', {
    data: { email: 'studentessa@demo.local', password: 'Demo1234!' },
  });
  expect((await request.post('/api/admin/create-admin', { data: account })).status()).toBe(403);
  await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  expect(
    (
      await request.post('/api/admin/create-admin', {
        headers: { origin: 'https://attacker.example' },
        data: account,
      })
    ).status(),
  ).toBe(403);
  for (const patch of [
    { email: 's-docente.nuovo@isiskeynes.it' },
    { email: 'nuovo.docente@example.com' },
    { email: 'altro.docente@isiskeynes.it' },
    { password: 'short', confirm: 'short' },
    { confirm: 'Different123!' },
    { first: '' },
  ]) {
    expect(
      (await request.post('/api/admin/create-admin', { data: { ...account, ...patch } })).status(),
    ).toBe(400);
  }
});

test('narrator reuses registration without class and keeps their own session', async ({
  page,
  browser,
}) => {
  await page.goto('/accedi');
  await page.getByRole('textbox', { name: 'Mail', exact: true }).fill('narratore@demo.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).toHaveURL(/\/narratore/);
  const originalSession = (await page.context().cookies()).find(
    (c) => c.name === 'one_piece_session',
  )?.value;
  await page.getByRole('button', { name: 'Nuovo admin' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[name="classCode"]')).toHaveCount(0);
  await dialog.locator('[name="email"]').fill(account.email.toUpperCase());
  await dialog.locator('[name="first"]').fill(account.first);
  await dialog.locator('[name="last"]').fill(account.last);
  await dialog.locator('[name="password"]').fill(account.password);
  await dialog.locator('[name="confirm"]').fill(account.confirm);
  await dialog.getByRole('button', { name: 'Crea admin' }).click();
  await expect(dialog.getByRole('status')).toContainText('Admin creato');
  expect((await page.context().cookies()).find((c) => c.name === 'one_piece_session')?.value).toBe(
    originalSession,
  );
  expect((await page.request.post('/api/admin/create-admin', { data: account })).status()).toBe(
    409,
  );
  const created = await browser.newContext();
  try {
    const login = await created.request.post('/api/auth/login', {
      data: { email: account.email, password: account.password },
    });
    expect(login.status()).toBe(200);
    await expect(login.json()).resolves.toMatchObject({ role: 'admin' });
    const adminPage = await created.newPage();
    await adminPage.goto('/narratore');
    await expect(adminPage.getByRole('button', { name: 'Nuovo admin' })).toBeVisible();
  } finally {
    await created.close();
  }
});
