import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';

test('new point rules persist consistently in daily entries, grades and rankings', async ({ request }) => {
  await request.post('/api/auth/login', { data: { email: 'narratore@demo.local', password: 'Demo1234!' } });
  const date = '2026-11-01', subject = 'TePi', user_id = 3;
  const totals = async () => (await (await request.get(`/api/data?date=${date}&subject=${subject}&totalsOnly=1`)).json()).totals[user_id];
  const before = await totals();
  expect((await request.post('/api/admin/registry', {
    data: { date, subject, rows: [{ user_id, presence: 'A+', phone: '+', bug: true, anxiety: true, mystery: true, multiverse: 'Nuove regole', multiverse_points: 80 }] },
  })).status()).toBe(200);
  for (const [type, grade, points] of [['progetto', 7, 700], ['interrogazione', 8, 120]] as const) {
    const response = await request.post('/api/admin/grade', { data: { user_id, date, subject, type, grade } });
    expect(response.status()).toBe(200);
    expect((await response.json()).points).toBe(points);
  }
  const stored = await (await request.get(`/api/data?date=${date}&subject=${subject}`)).json();
  expect(stored.daily.find((r: { user_id: number }) => r.user_id === user_id)).toMatchObject({ presence: 'A+', phone: '+', bug: 1, anxiety: 1, mystery: 1, multiverse_points: 80 });
  // -80 +30 +50 -30 +2000 +80 +700 +120, with no base bonus.
  expect(await totals()).toBe(before + 2870);
});

test('narrator totals include imported points and refresh after saving without counting draft defaults', async ({request,page}) => {
  await request.post('/api/auth/login',{data:{email:'narratore@demo.local',password:'Demo1234!'}});
  const workbook=new ExcelJS.Workbook();
  workbook.addWorksheet('Studenti').addRows([
    ['Classe','Nr.','Alunno/a','Ciurma'],['3CI',1,'IMPORTATI TOTALE','Totali'],['3CI',2,'ALTO PUNTEGGIO','Totali'],
  ]);
  workbook.addWorksheet('One Piece').addRows([
    ['Data','Rotta','Classe','Pirata','Tipologia','Punti','Voto','Materia'],
    [new Date('2026-09-16T12:00:00Z'),1,'3CI','IMPORTATI TOTALE','Bug',1230,null,'TPSIT'],
    [new Date('2026-09-16T12:00:00Z'),1,'3CI','IMPORTATI TOTALE','Bug',70,null,'SER'],
    [new Date('2026-09-16T12:00:00Z'),1,'3CI','ALTO PUNTEGGIO','Bug',12000,null,'TPSIT'],
  ]);
  const upload=await request.post('/api/admin/upload',{multipart:{mode:'details',file:{name:'Punti.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await workbook.xlsx.writeBuffer())}}});
  expect(upload.status()).toBe(200);
  await page.goto('/accedi');
  await page.locator('input[name="email"]').fill('narratore@demo.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.getByRole('button',{name:'Accedi',exact:true}).click();
  await expect(page).toHaveURL(/\/narratore$/);
  await page.goto('/narratore?classe=3CI&materia=TPSIT');
  await page.getByLabel('Data',{exact:true}).fill('2026-10-09');
  const row=page.locator('.registry-table tbody tr').filter({hasText:/Importati Totale/i});
  await expect(row.locator('td').last()).toHaveText('1230');
  await expect(row.locator('td').nth(11)).toHaveText('0');
  await page.getByRole('button',{name:'Ordina per Totale materia',exact:true}).click();
  await expect(page.getByRole('columnheader',{name:'Ordina per Totale materia'})).toHaveAttribute('aria-sort','descending');
  await expect(page.locator('.registry-table tbody tr').first()).toContainText('Alto Punteggio');
  await page.getByRole('button',{name:'Ordina per Totale materia',exact:true}).click();
  await expect(page.getByRole('columnheader',{name:'Ordina per Totale materia'})).toHaveAttribute('aria-sort','ascending');
  await expect(page.locator('.registry-table tbody tr').last()).toContainText('Alto Punteggio');
  await row.getByLabel('Telefono di Totale').selectOption('+');
  await page.getByRole('button',{name:'Ordina per Telefono',exact:true}).click();
  await expect(page.locator('.registry-table tbody tr').first()).toContainText('Importati Totale');
  await page.getByRole('button',{name:'Ordina per Telefono',exact:true}).click();
  await expect(page.locator('.registry-table tbody tr').last()).toContainText('Importati Totale');
  await expect(row.getByLabel('Telefono di Totale')).toHaveValue('+');
  await row.getByLabel('Telefono di Totale').selectOption('');
  await row.getByLabel('Presenza di Totale').selectOption('A+');
  await expect(row.locator('td').nth(11)).toHaveText('-80');
  await page.getByRole('button',{name:'Ordina per Totale giornata',exact:true}).click();
  await expect(page.locator('.registry-table tbody tr').last()).toContainText('Importati Totale');
  await page.getByRole('button',{name:'Ordina per Totale giornata',exact:true}).click();
  await expect(page.locator('.registry-table tbody tr').first()).toContainText('Importati Totale');
  await expect(row.locator('td').last()).toHaveText('1230');
  await page.getByRole('button',{name:'Salva registro',exact:true}).click();
  await expect(row.locator('td').last()).toHaveText('1150');
  await page.getByLabel('Data',{exact:true}).fill('2026-10-10');
  await expect(row.locator('td').last()).toHaveText('1150');
  await page.getByRole('button',{name:'Registro SER',exact:true}).click();
  await expect(row.locator('td').last()).toHaveText('70');
});

test('3CI and 4CI keep daily registers, grades and rankings separate by subject', async ({
  request,
  page,
}) => {
  expect(
    (
      await request.post('/api/auth/login', {
        data: { email: 'narratore@demo.local', password: 'Demo1234!' },
      })
    ).status(),
  ).toBe(200);
  const roster = new ExcelJS.Workbook();
  roster.addWorksheet('Studenti').addRows([
    ['Classe', 'Nr.', 'Alunno/a', 'Ciurma'],
    ['4CI', 1, 'SEPARATO LUCA', 'Separati'],
  ]);
  async function upload(workbook: ExcelJS.Workbook, mode: string, status = 200) {
    const response = await request.post('/api/admin/upload', {
      multipart: {
        mode,
        file: {
          name: 'Test.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
        },
      },
    });
    expect(response.status()).toBe(status);
    return response;
  }
  await upload(roster, 'details');
  const date = '2026-10-06';
  const historical = new ExcelJS.Workbook();
  historical.addWorksheet('Update').addRows([
    ['Mail', 'Data', 'Presenza', 'Telefono', 'Frutti', 'Note', 'Materia'],
    ['studentessa@demo.local', date, 'A', '', 7, 'Storico', 'TPSIT'],
    ['roster.4ci.separato.luca@studenti.invalid', date, 'A', '', 9, 'Storico', 'TPSIT'],
  ]);
  await upload(historical, 'update');
  const legacy = (await (await request.get(`/api/data?date=${date}&subject=TePi`)).json()).daily;
  const importedLegacy = legacy.filter((row: { fruit_note: string }) => row.fruit_note === 'Storico');
  expect(importedLegacy).toHaveLength(2);
  const ids = importedLegacy.map((row: { user_id: number }) => row.user_id);
  const missingSubject = new ExcelJS.Workbook();
  missingSubject.addWorksheet('Update').addRows([
    ['Mail', 'Data', 'Presenza', 'Telefono', 'Materia', 'Note'],
    ['studentessa@demo.local', date, 'P', '+', 'TPSIT', 'Da annullare'],
    ['roster.4ci.separato.luca@studenti.invalid', date, 'P', '+', '', 'Senza materia'],
  ]);
  const rejectedUpdate = await upload(missingSubject, 'update', 400);
  expect((await rejectedUpdate.json()).error).toContain('Update, riga 3');
  expect((await (await request.get(`/api/data?date=${date}&subject=TePi`)).json()).daily).toEqual(legacy);
  const missingPointSubject = new ExcelJS.Workbook();
  missingPointSubject.addWorksheet('One Piece').addRows([
    ['Data', 'Rotta', 'Classe', 'Pirata', 'Tipologia', 'Punti', 'Voto', 'Materia'],
    [new Date(`${date}T12:00:00Z`), 1, '4CI', 'SEPARATO LUCA', 'Bug', 100, null, ''],
  ]);
  const rejectedPoints = await upload(missingPointSubject, 'punti', 400);
  expect((await rejectedPoints.json()).error).toContain('One Piece, riga 2');
  const renamedSubject = new ExcelJS.Workbook();
  renamedSubject.addWorksheet('Update').addRows([
    ['Mail', 'Data', 'Presenza', 'Telefono', 'Materia', 'Note'],
    ['studentessa@demo.local', date, 'P', '+', 'TPSIT', 'Alias TPSIT'],
  ]);
  await upload(renamedSubject, 'update');
  const renamedDaily = (await (await request.get(`/api/data?date=${date}&subject=TePi`)).json()).daily;
  expect(renamedDaily.find((entry: { fruit_note: string }) => entry.fruit_note === 'Alias TPSIT')).toBeTruthy();
  const renamedPoints = new ExcelJS.Workbook();
  renamedPoints.addWorksheet('One Piece').addRows([
    ['Data', 'Rotta', 'Classe', 'Pirata', 'Tipologia', 'Punti', 'Voto', 'Materia'],
    [new Date(`${date}T12:00:00Z`), 1, '4CI', 'SEPARATO LUCA', 'Bug', 0, null, 'TPSIT'],
  ]);
  await upload(renamedPoints, 'punti');
  const row = (id: number, overrides = {}) => ({
    user_id: id,
    presence: 'P',
    phone: '+',
    bug: false,
    anxiety: false,
    mystery: false,
    weapon: '',
    multiverse: '',
    multiverse_points: 0,
    ...overrides,
  });
  for (const id of ids) {
    for (const [subject, presence, phone, grade] of [
      ['TePi', 'P', '+', 8],
      ['SER', 'A', '-', 5],
    ] as const) {
      const saved = await request.post('/api/admin/registry', {
        data: {
          date,
          subject,
          rows: [
            row(id, {
              presence,
              phone,
              mystery: subject === 'TePi',
              bug: subject === 'TePi',
              weapon: subject === 'TePi' ? 'Poseidon' : '',
            }),
          ],
        },
      });
      expect(saved.status()).toBe(200);
      expect(
        (
          await request.post('/api/admin/grade', {
            data: {
              user_id: id,
              date,
              subject,
              type: 'verifica',
              grade,
            },
          })
        ).status(),
      ).toBe(200);
    }
  }
  for (const id of ids) {
    const tepi = await (await request.get(`/api/data?date=${date}&subject=TePi`)).json();
    const ser = await (await request.get(`/api/data?date=${date}&subject=SER`)).json();
    expect(tepi.daily.find((r: { user_id: number }) => r.user_id === id)).toMatchObject({
      presence: 'P',
      phone: '+',
      bug: 1,
      mystery: 1,
      weapon: 'Poseidon',
      subject: 'TePi',
    });
    expect(ser.daily.find((r: { user_id: number }) => r.user_id === id)).toMatchObject({
      presence: 'A',
      phone: '',
      bug: 0,
      mystery: 0,
      weapon: '',
      subject: 'SER',
    });
    expect(tepi.grades.find((r: { user_id: number }) => r.user_id === id).points).toBe(1600);
    expect(ser.grades.find((r: { user_id: number }) => r.user_id === id).points).toBe(1000);
    expect(
      (await request.post('/api/admin/registry', { data: { date, rows: [row(id)] } })).status(),
    ).toBe(400);
  }
  expect((await (await request.get(`/api/data?date=${date}`)).json()).daily).toEqual([]);

  await page.goto('/accedi');
  await page.locator('input[name="email"]').fill('studentessa@demo.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/profilo$/);
  await expect(page.locator('.profile-balance')).toContainText('3680');
  await page.locator('.crew-profile').click();
  const crewDialog = page.getByRole('dialog', { name: 'Dettaglio ciurma' });
  const ownCrewRow = crewDialog.locator('.member-list > div').filter({ hasText: 'Rossi Nami' });
  await expect(ownCrewRow.getByLabel('3680 punti', { exact: true })).toBeVisible();
  await crewDialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Materie', exact: true })
    .getByRole('link', { name: 'SER', exact: true })
    .click();
  await expect(page.locator('.profile-balance')).toContainText('960');
  await page.locator('.crew-profile').click();
  await expect(ownCrewRow.getByLabel('960 punti', { exact: true })).toBeVisible();
  await expect(crewDialog).toContainText('Punteggio attuale · SER');
  await crewDialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await page.getByRole('link', { name: 'Apri la classifica' }).click();
  await expect(page).toHaveURL(/materia=SER/);
  await expect(
    page.locator('.leader-row').filter({ hasText: 'Rossi Nami' }).locator('.leader-score'),
  ).toHaveText('960 ฿');
  await page
    .getByRole('navigation', { name: 'Materie', exact: true })
    .getByRole('link', { name: 'TPSIT', exact: true })
    .click();
  await expect(
    page.locator('.leader-row').filter({ hasText: 'Rossi Nami' }).locator('.leader-score'),
  ).toHaveText('3680 ฿');
  await page.getByRole('combobox', { name: 'Anno', exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Applica', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rotta', exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Applica', exact: true }).click();
  await expect(page).toHaveURL(/materia=TePi/);
  await expect(
    page.locator('.leader-row').filter({ hasText: 'Rossi Nami' }).locator('.leader-score'),
  ).toHaveText('3680 ฿');
  await page
    .getByRole('navigation', { name: 'Materie', exact: true })
    .getByRole('link', { name: 'SER', exact: true })
    .click();
  await expect(page).toHaveURL(/anno=3&rotta=1/);
  await expect(
    page.locator('.leader-row').filter({ hasText: 'Rossi Nami' }).locator('.leader-score'),
  ).toHaveText('960 ฿');
});

test('the narrator switches subject without overwriting the other register', async ({ page }) => {
  await page.goto('/accedi');
  await page.locator('input[name="email"]').fill('narratore@demo.local');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/narratore$/);
  await page.getByRole('combobox', { name: /^Classe/ }).selectOption('3CI');
  await expect(page.getByRole('option', {name:'Registro precedente (senza materia)',exact:true})).toHaveCount(0);
  await page.getByLabel('Data', { exact: true }).fill('2026-10-07');
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  await page.getByLabel('Presenza di Nami').selectOption('A+');
  await page.getByRole('button', { name: 'Salva registro', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Registro TPSIT salvato');
  await page.getByRole('button', { name: 'Registro SER', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Registro SER · 3CI', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Presenza di Nami')).toHaveValue('');
  await page.getByLabel('Presenza di Nami').selectOption('A');
  await page.getByRole('button', { name: 'Salva registro', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Registro SER salvato');
  await page.getByRole('button', { name: 'Registro TPSIT', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salva registro', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Presenza di Nami')).toHaveValue('A+');
  await page.locator('.nav-classes summary').click();
  await page
    .getByRole('list', { name: 'Materie 4CI', exact: true })
    .getByRole('link', { name: 'SER', exact: true })
    .click();
  await expect(page).toHaveURL(/\/narratore\?classe=4CI&materia=SER/);
  await expect(
    page.getByRole('heading', { name: 'Registro SER · 4CI', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registro SER', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Registro TPSIT', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Registro TPSIT · 4CI', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Registro TPSIT · 4CI', exact: true }),
  ).toBeVisible();
});
