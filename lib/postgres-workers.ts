import { env } from 'cloudflare:workers';
import type { PoolConfig } from 'pg';

export function postgresConfig(): PoolConfig {
  // Hyperdrive handles pooling and verifies Supabase TLS with the uploaded root CA.
  return {
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 10000,
  };
}
