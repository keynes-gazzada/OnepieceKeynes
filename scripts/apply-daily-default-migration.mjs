import { readFileSync } from 'node:fs';
import pg from 'pg';
import { postgresConfig } from '../lib/postgres.ts';

process.loadEnvFile('.env.local');
const client = new pg.Client(postgresConfig());
try {
  await client.connect();
  const totals = () =>
    client.query(
      'SELECT count(*)::int AS events, coalesce(sum(points),0)::text AS points FROM keynes.point_events',
    );
  const before = (await totals()).rows[0];
  await client.query(
    readFileSync('supabase/migrations/202610090001_daily_zero_defaults.sql', 'utf8'),
  );
  const { rows } = await client.query(
    "SELECT column_default FROM information_schema.columns WHERE table_schema='keynes' AND table_name='daily' AND column_name='phone'",
  );
  if (rows[0]?.column_default !== "''::text")
    throw new Error('Valore predefinito del telefono non aggiornato.');
  const after = (await totals()).rows[0];
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Controllo dei punti importati fallito.');
  console.log(JSON.stringify({ phoneDefault: '', imported: after }));
} finally {
  await client.end();
}
