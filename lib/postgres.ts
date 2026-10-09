import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolConfig } from 'pg';
import { supabaseCa } from './supabase-ca.ts';

export function postgresConfig(): PoolConfig {
  const value = process.env.SUPABASE_DATABASE_URL;
  if (!value) throw new Error('SUPABASE_DATABASE_URL non configurata.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DATABASE_URL deve essere una connection string PostgreSQL.');
  }
  // Keep certificate verification in this configuration; URI SSL flags would override it.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ca: process.env.SUPABASE_CA_CERT_PATH
        ? readFileSync(
            /* turbopackIgnore: true */ resolve(process.env.SUPABASE_CA_CERT_PATH),
            'utf8',
          )
        : supabaseCa,
    },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  };
}
