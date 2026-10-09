import { after, NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createSession, clearSession, currentUser } from '@/lib/auth';
import { hashPassword, one, run, sha, verifyPassword } from '@/lib/database';
import { isSameOrigin } from '@/lib/security';
import { registrationStudent } from '@/lib/student-registration';
import {
  notifyStudentWelcome,
  passwordEmailConfigured,
  sendPasswordEmail,
} from '@/lib/password-email';
export const runtime = 'nodejs';
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (!isSameOrigin(request)) return fail('Richiesta non autorizzata.', 403);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Dati non validi.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Dati non validi.');
  const str = (key: string) => String(body[key] || '').trim();
  if (action === 'login') {
    const email = str('email').toLowerCase();
    const password = str('password');
    if (!email || !password) return fail('Inserisci mail e password.');
    const u = await one<{ id: number; salt: string; password_hash: string; role: string }>(
      'SELECT id,salt,password_hash,role FROM users WHERE email=?',
      email,
    );
    if (!u || !verifyPassword(password, u.salt, u.password_hash))
      return fail('Mail o password errate.', 401);
    await createSession(u.id);
    return NextResponse.json({ ok: true, role: u.role });
  }
  if (action === 'registration-student') {
    const email = str('email').toLowerCase();
    const result = await registrationStudent(email);
    if (result.error) return fail(result.error, result.status);
    const student = result.student;
    return NextResponse.json(
      {
        student: {
          email,
          first: student.first_name,
          last: student.last_name,
          classCode: student.class_code,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (action === 'register') {
    const email = str('email').toLowerCase(),
      password = str('password'),
      confirm = str('confirm');
    if (!email || !password || !confirm) return fail('Compila tutti i campi.');
    const result = await registrationStudent(email);
    if (result.error) return fail(result.error, result.status);
    const rosterUser = result.student;
    if (password.length < 8) return fail('La password deve contenere almeno 8 caratteri.');
    if (password !== confirm) return fail('Password non corrispondenti.');
    if (await one('SELECT id FROM users WHERE email=?', email))
      return fail('Mail già registrata.', 409);
    const passwordRecord = hashPassword(password);
    const updated = await run(
      'UPDATE users SET email=?,salt=?,password_hash=?,first_name=?,last_name=?,last_password_change=CURRENT_TIMESTAMP WHERE id=? AND email=?',
      email,
      passwordRecord.salt,
      passwordRecord.hash,
      rosterUser.first_name,
      rosterUser.last_name,
      rosterUser.id,
      rosterUser.email,
    );
    if (!updated.changes) return fail('Studente già registrato.', 409);
    await createSession(rosterUser.id);
    after(() =>
      notifyStudentWelcome({
        email,
        firstName: rosterUser.first_name,
        classCode: rosterUser.class_code,
        userId: rosterUser.id,
        appUrl: process.env.APP_URL || request.nextUrl.origin,
      }),
    );
    return NextResponse.json({ ok: true });
  }
  if (action === 'logout') {
    await clearSession();
    return NextResponse.json({ ok: true });
  }
  if (action === 'change-password') {
    const user = await currentUser();
    if (!user) return fail('Accedi per continuare.', 401);
    const old = str('old'),
      password = str('password'),
      confirm = str('confirm');
    if (!old || !password || !confirm) return fail('Compila tutti i campi.');
    if (password.length < 8) return fail('La nuova password deve contenere almeno 8 caratteri.');
    if (password !== confirm) return fail('Password non corrispondenti.');
    const record = (await one<{ salt: string; password_hash: string }>(
      'SELECT salt,password_hash FROM users WHERE id=?',
      user.id,
    ))!;
    if (!verifyPassword(old, record.salt, record.password_hash))
      return fail('Vecchia password errata.', 401);
    const h = hashPassword(password);
    await run(
      'UPDATE users SET salt=?,password_hash=?,last_password_change=CURRENT_TIMESTAMP WHERE id=?',
      h.salt,
      h.hash,
      user.id,
    );
    return NextResponse.json({ ok: true });
  }
  if (action === 'forgot') {
    const email = str('email').toLowerCase();
    if (!email) return fail('Inserisci la mail.');
    const u = await one<{ id: number }>('SELECT id FROM users WHERE email=?', email);
    if (!u) return fail('Utente non registrato.', 404);
    if (!passwordEmailConfigured())
      return fail('Il servizio mail non è ancora configurato. Contatta il narratore.', 503);
    const recent = await one(
      'SELECT user_id FROM reset_tokens WHERE user_id=? AND expires_at>?',
      u.id,
      Date.now() + 3540000,
    );
    if (recent) return fail('Attendi un minuto prima di richiedere un altro link.', 429);
    const token = randomBytes(32).toString('hex');
    await run(
      'INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)',
      sha(token),
      u.id,
      Date.now() + 3600000,
    );
    const url = `${process.env.APP_URL || request.nextUrl.origin}/recupero?token=${token}`;
    try {
      await sendPasswordEmail(email, url);
    } catch {
      await run('DELETE FROM reset_tokens WHERE token_hash=?', sha(token));
      return fail('Invio non riuscito. Riprova più tardi.', 503);
    }
    return NextResponse.json({ ok: true });
  }
  if (action === 'reset') {
    const token = str('token'),
      password = str('password'),
      confirm = str('confirm');
    if (!token || !password || !confirm) return fail('Compila tutti i campi.');
    if (password.length < 8) return fail('La password deve contenere almeno 8 caratteri.');
    if (password !== confirm) return fail('Password non corrispondenti.');
    const record = await one<{ user_id: number }>(
      'SELECT user_id FROM reset_tokens WHERE token_hash=? AND expires_at>?',
      sha(token),
      Date.now(),
    );
    if (!record) return fail('Il link non è più valido.', 410);
    const h = hashPassword(password);
    await run(
      'UPDATE users SET salt=?,password_hash=?,last_password_change=CURRENT_TIMESTAMP WHERE id=?',
      h.salt,
      h.hash,
      record.user_id,
    );
    await run('DELETE FROM reset_tokens WHERE user_id=?', record.user_id);
    await run('DELETE FROM sessions WHERE user_id=?', record.user_id);
    return NextResponse.json({ ok: true });
  }
  return fail('Operazione sconosciuta.', 404);
}
