import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { randomBytes } from 'node:crypto';
import { database, one, run, sha, type User } from './database';
import { redirect } from 'next/navigation';
const COOKIE = 'one_piece_session';
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const user = await one<User>(
    'SELECT u.id,u.email,u.first_name,u.last_name,u.class_code,u.role,u.crew_id,u.roles,u.last_password_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
    sha(token),
    Date.now(),
  );
  return user || null;
});
export async function requireUser(role?: 'admin' | 'student') {
  const u = await currentUser();
  if (!u) redirect('/accedi');
  if (role && u.role !== role) redirect('/');
  return u;
}
export async function createSession(userId: number) {
  const token = randomBytes(32).toString('hex');
  await run(
    'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',
    sha(token),
    userId,
    Date.now() + 1000 * 60 * 60 * 24 * 14,
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
}
export async function clearSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await run('DELETE FROM sessions WHERE token_hash=?', sha(token));
  store.delete(COOKIE);
}
export async function cleanExpired() {
  await database().exec(
    `DELETE FROM sessions WHERE expires_at < ${Date.now()}; DELETE FROM reset_tokens WHERE expires_at < ${Date.now()};`,
  );
}
