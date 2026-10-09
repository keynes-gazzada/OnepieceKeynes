import { readFileSync } from 'node:fs';
import pg from 'pg';
import { postgresConfig } from '../lib/postgres.ts';

process.loadEnvFile('.env.local');
const client = new pg.Client(postgresConfig());
try {
  await client.connect();
  const snapshot = () => client.query('SELECT count(*)::int AS events,sum(points)::text AS points FROM keynes.point_events');
  const before = (await snapshot()).rows[0];
  await client.query(
    readFileSync('supabase/migrations/202610090002_imported_registry.sql', 'utf8'),
  );
  const { rows } = await snapshot();
  if (JSON.stringify(before) !== JSON.stringify(rows[0])) throw new Error('I punti importati sono cambiati.');
  console.log(JSON.stringify({ migration: 'imported_registry', imported: rows[0] }));
} finally {
  await client.end();
}
