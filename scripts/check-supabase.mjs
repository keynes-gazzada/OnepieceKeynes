import { existsSync } from 'node:fs';
import pg from 'pg';
import { postgresConfig } from '../lib/postgres.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Configura URL e chiave pubblica Supabase in .env.local.');
  process.exit(1);
}

try {
  const response = await fetch(new URL('/auth/v1/settings', url), {
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error(`Supabase non ha accettato la configurazione: HTTP ${response.status}.`);
    process.exitCode = 1;
  } else {
    console.log('Supabase raggiungibile; URL e chiave pubblica accettati.');
    if (process.env.SUPABASE_DATABASE_URL) {
      const client = new pg.Client(postgresConfig());
      try {
        await client.connect();
        const result = await client.query(
          "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='keynes'",
        );
        console.log(
          `Connessione PostgreSQL verificata con TLS; tabelle del registro: ${result.rows[0].n}.`,
        );
        if (Number(result.rows[0].n) !== 12) {
          console.error('Completa la migrazione del registro.');
          process.exitCode = 1;
        }
      } finally {
        await client.end().catch(() => {});
      }
    } else {
      console.log('SUPABASE_DATABASE_URL assente: il registro usa SQLite.');
    }
  }
} catch {
  console.error('Connessione Supabase non riuscita. Controlla URL, rete e stato del progetto.');
  process.exitCode = 1;
}
