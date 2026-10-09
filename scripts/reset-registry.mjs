import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { postgresConfig } from '../lib/postgres.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const tables = ['crews', 'users', 'sessions', 'reset_tokens', 'routes', 'islands', 'daily', 'grades', 'point_events', 'dreams', 'mysteries', 'imported_rows'];
const client = new pg.Client(postgresConfig());
let transaction = false;
try {
  await client.connect();
  await client.query('BEGIN');
  transaction = true;
  await client.query('SET LOCAL search_path = keynes, pg_catalog');
  await client.query("SET LOCAL lock_timeout = '10s'");
  if (process.argv.includes('--apply')) {
    await client.query(`LOCK TABLE ${tables.join(', ')} IN EXCLUSIVE MODE`);
  }
  const data = {};
  for (const table of tables) {
    data[table] = (await client.query(`SELECT * FROM ${table} ORDER BY ${['sessions', 'reset_tokens'].includes(table) ? 'token_hash' : 'id'}`)).rows;
  }
  console.log(JSON.stringify({before:Object.fromEntries(tables.map(table => [table,data[table].length])), userRoles:data.users.reduce((counts,user) => ({...counts,[user.role]:(counts[user.role] || 0)+1}),{})}));
  if (!process.argv.includes('--apply')) {
    await client.query('ROLLBACK');
    transaction = false;
  } else {
    const admins = data.users.filter(user => user.role === 'admin');
    if (!admins.length || data.users.some(user => !['admin','student'].includes(user.role))) {
      throw new Error('Unexpected user roles or no administrator: reset aborted.');
    }
    const backupDir = resolve('.data/backups');
    await mkdir(backupDir,{recursive:true});
    const backupPath = resolve(backupDir,`before-registry-reset-${Date.now()}.json`);
    const backup = JSON.stringify({createdAt:new Date().toISOString(),schema:'keynes',data});
    await writeFile(backupPath,backup,{flag:'wx',mode:0o600});
    const checksum = value => createHash('sha256').update(value).digest('hex');
    if (checksum(await readFile(backupPath)) !== checksum(backup)) throw new Error('Backup verification failed.');
    for (const table of ['daily','grades','point_events','dreams','imported_rows','islands','routes','mysteries','reset_tokens']) await client.query(`DELETE FROM ${table}`);
    await client.query("DELETE FROM users WHERE role='student'");
    await client.query("UPDATE users SET crew_id=NULL WHERE role='admin'");
    await client.query('DELETE FROM crews');
    const after = {};
    for (const table of tables) after[table] = Number((await client.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
    const remaining = (await client.query('SELECT * FROM users ORDER BY id')).rows;
    if (remaining.length !== admins.length || remaining.some(user => !admins.some(admin => admin.id === user.id && admin.email === user.email && admin.password_hash === user.password_hash))) throw new Error('Administrator preservation check failed.');
    if (['crews','reset_tokens','routes','islands','daily','grades','point_events','dreams','mysteries','imported_rows'].some(table => after[table] !== 0)) throw new Error('Registry is not empty.');
    await client.query('COMMIT');
    transaction = false;
    console.log(JSON.stringify({after,administratorsPreserved:admins.length,backupVerified:true}));
  }
} finally {
  if (transaction) await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
