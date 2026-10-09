import { readFileSync } from 'node:fs';
import pg from 'pg';
import { postgresConfig } from '../lib/postgres.ts';

process.loadEnvFile('.env.local');
const client = new pg.Client(postgresConfig());
try {
  await client.connect();
  await client.query(readFileSync('supabase/migrations/202610060002_dream_points.sql', 'utf8'));
  const { rows } = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='keynes' AND table_name='dreams' AND column_name IN ('points','date','subject')",
  );
  if (rows.length !== 3) throw new Error('Migrazione dei punti sogno incompleta.');
  console.log('Supabase: colonne punti, data e materia dei sogni verificate.');
} finally {
  await client.end();
}
