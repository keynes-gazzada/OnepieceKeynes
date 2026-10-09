import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';

test('student email fills roster data, clears stale matches and registers with password only', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Studenti').addRows([
    ['Classe', 'Nr.', 'Alunno/a', 'Ciurma'],
    ['4CI', 1, 'AUTOCOMPILA MARIO', 'Automatica'],
    ['3CI', 2, 'D’ANGELO ÉLISA MARIA', 'Automatica'],
  ]);
  const imported = await request.post('/api/admin/upload', {
    multipart: {
      mode: 'details',
      file: {
        name: 'Autocompila.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      },
    },
  });
  expect(imported.status()).toBe(200);
  await request.post('/api/auth/logout', { data: {} });
  const lookup = await request.post('/api/auth/registration-student', {
    data: { email: ' S-DANGELO.ELISAMARIA@ISISKEYNES.IT ' },
  });
  expect(lookup.status()).toBe(200);
  expect(lookup.headers()['cache-control']).toBe('no-store');
  expect((await lookup.json()).student).toEqual({
    email: 's-dangelo.elisamaria@isiskeynes.it',
    first: 'Élisa Maria',
    last: 'D’angelo',
    classCode: '3CI',
  });
  await page.goto('/registrati');
  const email = page.locator('[name="email"]');
  const first = page.locator('[name="first"]');
  const last = page.locator('[name="last"]');
  const cls = page.locator('[name="classCode"]');
  const register = page.getByRole('button', { name: 'Registrati', exact: true });
  await expect(register).toBeDisabled();
  await email.fill('s-autocompila.mario@isiskeynes.it');
  await expect(first).toHaveValue('Mario');
  await expect(last).toHaveValue('Autocompila');
  await expect(cls).toHaveValue('4CI');
  for (const input of [first, last, cls]) await expect(input).toHaveAttribute('readonly', '');
  await email.fill('s-nonpresente.altro@isiskeynes.it');
  await expect(first).toHaveValue('');
  await expect(register).toBeDisabled();
  await expect(page.locator('.auth-form [role="alert"]')).toContainText('Non risulti');
  // A late reply to the previous email must not restore stale student details.
  await page.route('**/api/auth/registration-student', async (route) => {
    if (route.request().postDataJSON().email === 's-autocompila.mario@isiskeynes.it') {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        json: {
          student: {
            email: 's-autocompila.mario@isiskeynes.it',
            first: 'Mario',
            last: 'Autocompila',
            classCode: '4CI',
          },
        },
      });
    } else await route.continue();
  });
  await email.fill('s-autocompila.mario@isiskeynes.it');
  await page.waitForRequest((req) => req.url().endsWith('/api/auth/registration-student'));
  await email.fill('s-dangelo.elisamaria@isiskeynes.it');
  await expect(first).toHaveValue('Élisa Maria');
  await expect(cls).toHaveValue('3CI');
  await expect(first).toHaveValue('Élisa Maria', { timeout: 1500 });
  await page.unroute('**/api/auth/registration-student');
  await email.fill('s-autocompila.mario@isiskeynes.it');
  await expect(first).toHaveValue('Mario');
  await page.locator('[name="password"]').fill('Student123!');
  await page.locator('[name="confirm"]').fill('Student123!');
  await register.click();
  await expect(page).toHaveURL(/\/profilo$/);
  await expect(page.getByRole('heading', { name: 'Autocompila Mario', exact: true })).toBeVisible();
  await page.request.post('/api/auth/logout', { data: {} });
  await page.goto('/registrati');
  await email.fill('s-autocompila.mario@isiskeynes.it');
  await expect(page.locator('.auth-form [role="alert"]')).toContainText('Studente già registrato');
  await expect(first).toHaveValue('');
  await expect(register).toBeDisabled();
  const duplicate = await request.post('/api/auth/register', {
    data: {
      email: 's-autocompila.mario@isiskeynes.it',
      password: 'Student123!',
      confirm: 'Student123!',
    },
  });
  expect(duplicate.status()).toBe(409);
  const direct = await request.post('/api/auth/register', {
    data: {
      email: 's-dangelo.elisamaria@isiskeynes.it',
      password: 'Student123!',
      confirm: 'Student123!',
    },
  });
  expect(direct.status()).toBe(200);
});

test('compound surnames and given names are resolved from the school email without losing roster identity', async ({
  request,
  page,
}) => {
  await request.post('/api/auth/login', {
    data: { email: 'narratore@demo.local', password: 'Demo1234!' },
  });
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Studenti').addRows([
    ['Classe', 'Nr.', 'Alunno/a', 'Ciurma'],
    ['5CI', 1, 'CALDERON SEGOVIA MICHAEL', 'Composti'],
    ['4CI', 2, 'PEREZ GARCIA ANA MARIA', 'Composti'],
    ['3CI', 3, 'OMONIMO ROSSI ANNA', 'Composti'],
    ['4CI', 4, 'OMONIMO ROSSI ANNA', 'Composti'],
  ]);
  const imported = await request.post('/api/admin/upload', {
    multipart: {
      mode: 'details',
      file: {
        name: 'Composti.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      },
    },
  });
  expect(imported.status()).toBe(200);
  await page.goto('/registrati');
  await page.locator('[name="email"]').fill('s-calderonsegovia.michael@isiskeynes.it');
  await expect(page.locator('[name="first"]')).toHaveValue('Michael');
  await expect(page.locator('[name="last"]')).toHaveValue('Calderon Segovia');
  await expect(page.locator('[name="classCode"]')).toHaveValue('5CI');
  await page.locator('[name="email"]').fill('s-perezgarcia.anamaria@isiskeynes.it');
  await expect(page.locator('[name="first"]')).toHaveValue('Ana Maria');
  await expect(page.locator('[name="last"]')).toHaveValue('Perez Garcia');
  await expect(page.locator('[name="classCode"]')).toHaveValue('4CI');
  const ambiguous = await request.post('/api/auth/registration-student', {
    data: { email: 's-omonimorossi.anna@isiskeynes.it' },
  });
  expect(ambiguous.status()).toBe(409);
  expect((await ambiguous.json()).error).toContain('più studenti');
  const invented = await request.post('/api/auth/registration-student', {
    data: { email: 's-perezgarcia.ana@isiskeynes.it' },
  });
  expect(invented.status()).toBe(403);
  const activated = await page.request.post('/api/auth/register', {
    data: {
      email: 's-perezgarcia.anamaria@isiskeynes.it',
      password: 'Student123!',
      confirm: 'Student123!',
      first: 'Manipolato',
      last: 'Falso',
    },
  });
  expect(activated.status()).toBe(200);
  await page.goto('/profilo');
  await expect(
    page.getByRole('heading', { name: 'Perez Garcia Ana Maria', exact: true }),
  ).toBeVisible();
  // Re-importing the full name must retain the activated account, not create a duplicate.
  expect(
    (
      await request.post('/api/admin/upload', {
        multipart: {
          mode: 'details',
          file: {
            name: 'Composti.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
          },
        },
      })
    ).status(),
  ).toBe(200);
  const lookup = await request.post('/api/auth/registration-student', {
    data: { email: 's-perezgarcia.anamaria@isiskeynes.it' },
  });
  expect(lookup.status()).toBe(409);
  expect((await lookup.json()).error).toContain('già registrato');
});
