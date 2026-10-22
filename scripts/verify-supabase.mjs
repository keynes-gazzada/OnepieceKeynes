import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { createSqlDatabase } from '../lib/sql-database.ts';
import { importPuntiWorkbook } from '../lib/punti-import.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.SUPABASE_DATABASE_URL) throw new Error('Configura SUPABASE_DATABASE_URL.');
process.env.DATABASE_DRIVER = 'postgres';
const adapter = createSqlDatabase();
const db = adapter.database;
const rollback = new Error('ROLLBACK_VERIFICATION');
const suffix = randomUUID().replaceAll('-', '');
const crewName = `Verifica ${suffix}`;
const source = `verify-${suffix}.xlsx`;
try {
  const before = await db.prepare('SELECT COUNT(*) s FROM users').get();
  try {
    await adapter.transaction(async () => {
      const inserted = await db
        .prepare('INSERT INTO crews(name,class_code,flag) VALUES(?,?,?)')
        .run(crewName, '3CI', 'skull');
      assert.ok(inserted.lastInsertRowid > 0);
      const crew = await db
        .prepare('SELECT id FROM crews WHERE name=? COLLATE NOCASE')
        .get(crewName.toUpperCase());
      assert.equal(crew.id, inserted.lastInsertRowid);
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('Studenti').addRows([
        ['Classe', 'Nr.', 'Alunno/a', 'Ciurma'],
        ['3CI', 1, `VERIFICA ${suffix.toUpperCase()}`, crewName],
      ]);
      workbook.addWorksheet('One Piece').addRows([
        ['Data', 'Rotta', 'Classe', 'Pirata', 'Tipologia', 'Punti', 'Voto', 'Materia'],
        [
          new Date('2026-10-06T00:00:00Z'),
          1,
          '3CI',
          `VERIFICA ${suffix.toUpperCase()}`,
          'Bug',
          12,
          '',
          'TePi',
        ],
      ]);
      for (let pass = 0; pass < 2; pass++) {
        const imported = await importPuntiWorkbook(db, workbook, source);
        assert.equal(imported.students, 1);
        assert.equal(imported.events, 1);
      }
      const events = await db
        .prepare('SELECT COUNT(*) s FROM point_events WHERE source=?')
        .get(source);
      assert.equal(events.s, 1);
      const event = await db.prepare('SELECT user_id FROM point_events WHERE source=?').get(source);
      await db
        .prepare(
          'INSERT INTO daily(date,user_id,subject,presence,phone) VALUES(?,?,?,?,?) ON CONFLICT(date,user_id,subject) DO UPDATE SET presence=excluded.presence,phone=excluded.phone,updated_at=CURRENT_TIMESTAMP',
        )
        .run('2026-10-06', event.user_id, '', 'P', '+');
      await db
        .prepare(
          'INSERT INTO daily(date,user_id,subject,presence,phone) VALUES(?,?,?,?,?) ON CONFLICT(date,user_id,subject) DO UPDATE SET presence=excluded.presence,phone=excluded.phone,updated_at=CURRENT_TIMESTAMP',
        )
        .run('2026-10-06', event.user_id, '', 'A', '-');
      const rows = await db.prepare('SELECT * FROM daily WHERE user_id=?').all(event.user_id);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].subject, '');
      assert.equal(rows[0].phone, '-');
      console.log(
        'PostgreSQL: ID automatici, ricerca nomi, importazione Excel ripetibile e registro unico verificati.',
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  const after = await db.prepare('SELECT COUNT(*) s FROM users').get();
  assert.equal(after.s, before.s);
  assert.equal(await db.prepare('SELECT id FROM crews WHERE name=?').get(crewName), undefined);
  assert.equal(
    (await db.prepare('SELECT COUNT(*) s FROM point_events WHERE source=?').get(source)).s,
    0,
  );
  console.log('Rollback verificato: tutti i dati di prova sono stati annullati.');
} catch (error) {
  console.error('Verifica Supabase fallita: ' + (error.code || error.message));
  process.exitCode = 1;
} finally {
  await adapter.close();
}
