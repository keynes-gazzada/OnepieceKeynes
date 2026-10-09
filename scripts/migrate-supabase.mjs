import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { postgresConfig } from '../lib/postgres.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const tables = [
  'crews',
  'users',
  'sessions',
  'reset_tokens',
  'routes',
  'islands',
  'daily',
  'grades',
  'point_events',
  'dreams',
  'mysteries',
  'imported_rows',
];
const sourcePath = resolve(process.env.DATABASE_PATH || '.data/one-piece.sqlite');
if (!existsSync(sourcePath)) throw new Error('Database SQLite sorgente non trovato.');
const source = new DatabaseSync(sourcePath, { readOnly: true });
const target = new pg.Client(postgresConfig());
let inTransaction = false;
function checksum(rows) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        rows.map((row) =>
          Object.fromEntries(
            Object.keys(row)
              .sort()
              .map((key) => [key, key === 'expires_at' ? Number(row[key]) : row[key]]),
          ),
        ),
      ),
    )
    .digest('hex');
}

try {
  const data = Object.fromEntries(
    tables.map((table) => [
      table,
      source
        .prepare(
          `SELECT * FROM ${table} ORDER BY ${['sessions', 'reset_tokens'].includes(table) ? 'token_hash' : 'id'}`,
        )
        .all(),
    ]),
  );
  await target.connect();
  console.log('Connessione Supabase verificata con TLS.');
  for (const table of tables) console.log(`${table}: ${data[table].length} righe da trasferire`);
  if (!process.argv.includes('--apply')) {
    console.log(
      'Verifica completata. Nessuna modifica remota. Per migrare: npm run supabase:migrate -- --apply',
    );
  } else {
    const backup = resolve('.data/backups', `before-supabase-${Date.now()}.sqlite`);
    mkdirSync(dirname(backup), { recursive: true });
    source.prepare('VACUUM INTO ?').run(backup);
    console.log('Backup SQLite creato in .data/backups.');
    await target.query('BEGIN');
    inTransaction = true;
    await target.query(
      readFileSync('supabase/migrations/202610060001_registry.sql', 'utf8')
        .replace(/^BEGIN;\s*$/m, '')
        .replace(/^COMMIT;\s*$/m, ''),
    );
    await target.query(
      readFileSync('supabase/migrations/202610060002_dream_points.sql', 'utf8')
        .replace(/^BEGIN;\s*$/m, '')
        .replace(/^COMMIT;\s*$/m, ''),
    );
    for (const migration of ['202610090001_daily_zero_defaults.sql', '202610090002_imported_registry.sql']) {
      await target.query(readFileSync(`supabase/migrations/${migration}`, 'utf8')
        .replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, ''));
    }
    const existing = await target.query(
      'SELECT (SELECT COUNT(*) FROM keynes.users)+(SELECT COUNT(*) FROM keynes.crews)+(SELECT COUNT(*) FROM keynes.routes)+(SELECT COUNT(*) FROM keynes.daily)+(SELECT COUNT(*) FROM keynes.point_events)+(SELECT COUNT(*) FROM keynes.grades)+(SELECT COUNT(*) FROM keynes.mysteries)+(SELECT COUNT(*) FROM keynes.imported_rows)+(SELECT COUNT(*) FROM keynes.islands)+(SELECT COUNT(*) FROM keynes.dreams)+(SELECT COUNT(*) FROM keynes.sessions)+(SELECT COUNT(*) FROM keynes.reset_tokens) AS n',
    );
    if (Number(existing.rows[0].n) !== 0)
      throw new Error(
        'Lo schema keynes contiene già dati: migrazione interrotta senza sovrascriverli.',
      );
    for (const table of tables) {
      const rows = data[table];
      if (rows.length) {
        const columns = Object.keys(rows[0]);
        if (!columns.every((column) => /^[a-z_]+$/.test(column)))
          throw new Error('Colonne sorgente non valide.');
        for (let offset = 0; offset < rows.length; offset += 200) {
          const batch = rows.slice(offset, offset + 200);
          const values = batch.flatMap((row) => columns.map((column) => row[column]));
          const placeholders = batch
            .map(
              (_, index) =>
                '(' +
                columns.map((_, column) => `$${index * columns.length + column + 1}`).join(',') +
                ')',
            )
            .join(',');
          await target.query(
            `INSERT INTO keynes.${table} (${columns.map((column) => `"${column}"`).join(',')}) VALUES ${placeholders}`,
            values,
          );
        }
      }
      const key = ['sessions', 'reset_tokens'].includes(table) ? 'token_hash' : 'id';
      const selectedColumns = rows.length
        ? Object.keys(rows[0])
            .map((column) => `"${column}"`)
            .join(',')
        : '*';
      const migrated = await target.query(
        `SELECT ${selectedColumns} FROM keynes.${table} ORDER BY ${key}`,
      );
      if (checksum(rows) !== checksum(migrated.rows))
        throw new Error(`Verifica dei dati fallita per ${table}.`);
      if (key === 'id')
        await target.query(
          `SELECT setval(pg_get_serial_sequence('keynes.${table}','id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM keynes.${table}`,
        );
      console.log(`${table}: trasferimento e verifica completati`);
    }
    await target.query('COMMIT');
    inTransaction = false;
    console.log('Migrazione completata. Il database SQLite originale è conservato.');
  }
} catch (error) {
  if (inTransaction) await target.query('ROLLBACK').catch(() => {});
  console.error('Migrazione non completata: ' + (error.code || error.message));
  process.exitCode = 1;
} finally {
  source.close();
  await target.end().catch(() => {});
}
