import 'server-only';
import { createHash } from 'node:crypto';

export function passwordEmailConfigured() {
  if (process.env.EMAIL_PROVIDER === 'resend')
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

export async function sendPasswordEmail(to: string, url: string) {
  const subject = 'Keynes Grand Line · Recupero password';
  const text = `Hai richiesto una nuova password per Keynes Grand Line.\n\nApri questo link, valido un’ora: ${url}\n\nSe non hai fatto questa richiesta, ignora questa email. La tua password non cambia.`;
  const escapedUrl = escapeHtml(url);
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17110e;line-height:1.6">
    <h1 style="font-size:24px">Recupero password</h1>
    <p>Hai richiesto una nuova password per Keynes Grand Line.</p>
    <p><a href="${escapedUrl}" style="display:inline-block;background:#b00618;color:#fff;padding:12px 20px;text-decoration:none">Imposta una nuova password</a></p>
    <p>Il link è valido un’ora e può essere usato una sola volta.</p>
    <p>Se il pulsante non funziona, copia questo link nel browser:<br><a href="${escapedUrl}">${escapedUrl}</a></p>
    <p>Se non hai fatto questa richiesta, ignora questa email. La tua password non cambia.</p>
  </div>`;
  await sendEmail(
    to,
    subject,
    text,
    html,
    `password-reset/${createHash('sha256').update(url).digest('hex')}`,
  );
}

export async function notifyStudentWelcome({
  email,
  firstName,
  classCode,
  userId,
  appUrl,
}: {
  email: string;
  firstName: string;
  classCode: string;
  userId: number;
  appUrl: string;
}) {
  if (!passwordEmailConfigured()) return;
  try {
    const url = new URL('/profilo', appUrl).href;
    const subject = 'Benvenuto su Keynes Grand Line';
    const text = `Ciao ${firstName},\n\nil tuo account Keynes Grand Line è attivo.\nClasse: ${classCode}\n\nDal tuo profilo puoi consultare punti, voti e classifiche.\nApri il profilo: ${url}\n\nAccedi con la tua email scolastica e la password che hai scelto durante la registrazione.`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17110e;line-height:1.6">
      <h1 style="font-size:24px">Benvenuto su Keynes Grand Line</h1>
      <p>Ciao ${escapeHtml(firstName)}, il tuo account è attivo.</p>
      <p>Classe: ${escapeHtml(classCode)}</p>
      <p>Dal tuo profilo puoi consultare punti, voti e classifiche.</p>
      <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#b00618;color:#fff;padding:12px 20px;text-decoration:none">Apri il tuo profilo</a></p>
      <p>Accedi con la tua email scolastica e la password che hai scelto durante la registrazione.</p>
    </div>`;
    await sendEmail(email, subject, text, html, `student-welcome/${userId}`);
  } catch {
    // Delivery must never undo registration or expose personal data in logs.
    console.error('Welcome email delivery failed');
  }
}

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
  idempotencyKey: string,
) {
  if (process.env.EMAIL_PROVIDER === 'resend') {
    if (!passwordEmailConfigured()) throw new Error('Email service not configured');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Email service rejected request (${response.status})`);
    const result: { id?: string } = await response.json();
    if (!result.id) throw new Error('Email service did not acknowledge the message');
    return;
  }

  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 10000,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
}
