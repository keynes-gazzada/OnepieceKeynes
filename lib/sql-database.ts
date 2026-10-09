import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import type { DatabaseSync } from 'node:sqlite';
import { postgresConfig } from './postgres.ts';

export type SqlValue = string | number | null;
export type WriteResult = { changes: number; lastInsertRowid: number | bigint };
export interface SqlDatabase {
  dialect: 'sqlite' | 'postgres';
  prepare(sql: string): {
    all(...params: SqlValue[]): Promise<Record<string, unknown>[]>;
    get(...params: SqlValue[]): Promise<Record<string, unknown> | undefined>;
    run(...params: SqlValue[]): Promise<WriteResult>;
  };
  exec(sql: string): Promise<void>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}

const tables =
  'crews|users|sessions|reset_tokens|routes|islands|daily|grades|point_events|dreams|mysteries|imported_rows';
const idTables = new Set(
  tables.split('|').filter((table) => !['sessions', 'reset_tokens'].includes(table)),
);

export function postgresSql(sql: string) {
  let index = 0;
  const insensitive = sql.replace(
    /([a-z_][\w.]*)\s*=\s*\?\s+COLLATE NOCASE/gi,
    'lower($1)=lower(?)',
  );
  // Preserve literals and quoted identifiers while translating parameter markers and tables.
  return insensitive
    .split(/('(?:''|[^'])*'|"(?:""|[^"])*")/g)
    .map((part, position) => {
      if (position % 2) return part;
      return part
        .replace(new RegExp(`\\b(FROM|JOIN|UPDATE|INTO)\\s+(${tables})\\b`, 'gi'), '$1 keynes.$2')
        .replace(/\?/g, () => `$${++index}`);
    })
    .join('');
}

export function createSqlDatabase(sqliteFactory?: () => DatabaseSync) {
  const dialect =
    process.env.DATABASE_DRIVER === 'sqlite' ||
    (!process.env.SUPABASE_DATABASE_URL && process.env.DATABASE_RUNTIME !== 'workers')
      ? 'sqlite'
      : 'postgres';
  if (
    process.env.DATABASE_DRIVER === 'postgres' &&
    !process.env.SUPABASE_DATABASE_URL &&
    process.env.DATABASE_RUNTIME !== 'workers'
  ) {
    throw new Error('DATABASE_DRIVER=postgres richiede SUPABASE_DATABASE_URL.');
  }
  if (
    process.env.DATABASE_DRIVER &&
    !['sqlite', 'postgres'].includes(process.env.DATABASE_DRIVER)
  ) {
    throw new Error('DATABASE_DRIVER deve essere sqlite o postgres.');
  }
  let pool: pg.Pool | undefined;
  const workers = process.env.DATABASE_RUNTIME === 'workers';
  const context = new AsyncLocalStorage<pg.Client | pg.PoolClient | DatabaseSync>();
  let queue = Promise.resolve();

  function postgresPool() {
    if (!pool) {
      pool = new pg.Pool(postgresConfig());
      pool.on('error', () => console.error('Connessione PostgreSQL inattiva interrotta.'));
    }
    return pool;
  }
  async function postgresConnection() {
    // Worker sockets belong to the request that opened them; never reuse a global pool.
    if (!workers) return postgresPool().connect();
    const client = new pg.Client(postgresConfig());
    await client.connect();
    return client;
  }
  async function releaseConnection(client: pg.Client | pg.PoolClient) {
    if ('release' in client) client.release();
    else await client.end();
  }
  async function postgresQuery(sql: string, params: SqlValue[] = []) {
    const current = context.getStore() as pg.Client | pg.PoolClient | undefined;
    if (current) return current.query(sql, params);
    if (!workers) return postgresPool().query(sql, params);
    const client = await postgresConnection();
    try {
      return await client.query(sql, params);
    } finally {
      await releaseConnection(client);
    }
  }
  async function sqliteLock<T>(operation: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
  function sqlite() {
    if (!sqliteFactory) throw new Error('Database SQLite non disponibile.');
    return sqliteFactory();
  }
  async function query(
    sql: string,
    params: SqlValue[] = [],
    write = false,
  ): Promise<{ rows: Record<string, unknown>[]; changes: number }> {
    if (dialect === 'sqlite') {
      const operation = () => {
        const db = (context.getStore() as DatabaseSync | undefined) || sqlite();
        if (write) {
          const result = db.prepare(sql).run(...params);
          return { rows: [{ id: result.lastInsertRowid }], changes: Number(result.changes) };
        }
        return {
          rows: db
            .prepare(sql)
            .all(...params)
            .map((row) => ({ ...row })) as Record<string, unknown>[],
          changes: 0,
        };
      };
      return context.getStore() ? operation() : sqliteLock(operation);
    }
    let translated = postgresSql(sql);
    const inserted = sql.match(/^\s*INSERT\s+INTO\s+(\w+)/i)?.[1]?.toLowerCase();
    if (write && inserted && idTables.has(inserted) && !/\bRETURNING\b/i.test(sql)) {
      translated = translated.replace(/;\s*$/, '') + ' RETURNING id';
    }
    const result = await postgresQuery(translated, params);
    // PostgreSQL SUM(integer) returns int8 as text. All registry integers fit JS's safe range.
    const rows = result.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          (key === 's' || key === 'expires_at') && typeof value === 'string'
            ? Number(value)
            : value,
        ]),
      ),
    );
    return { rows, changes: result.rowCount || 0 };
  }

  const database: SqlDatabase = {
    dialect,
    transaction,
    prepare(sql) {
      return {
        async all(...params) {
          return (await query(sql, params)).rows;
        },
        async get(...params) {
          return (await query(sql, params)).rows[0];
        },
        async run(...params) {
          const result = await query(sql, params, true);
          return { changes: result.changes, lastInsertRowid: Number(result.rows[0]?.id || 0) };
        },
      };
    },
    async exec(sql) {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) {
        throw new Error('Usa transaction() per garantire una connessione dedicata.');
      }
      if (dialect === 'sqlite') {
        const operation = () =>
          ((context.getStore() as DatabaseSync | undefined) || sqlite()).exec(sql);
        if (context.getStore()) operation();
        else await sqliteLock(operation);
      } else {
        await postgresQuery(postgresSql(sql));
      }
    },
  };

  async function transaction<T>(operation: () => Promise<T>): Promise<T> {
    if (context.getStore()) return operation();
    if (dialect === 'sqlite') {
      return sqliteLock(async () => {
        const db = sqlite();
        db.exec('BEGIN IMMEDIATE');
        try {
          const value = await context.run(db, operation);
          db.exec('COMMIT');
          return value;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      });
    }
    const client = await postgresConnection();
    try {
      await client.query('BEGIN');
      const value = await context.run(client, operation);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await releaseConnection(client);
    }
  }

  return {
    database,
    transaction,
    async close() {
      await pool?.end();
    },
  };
}
