import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Next.js resolves server-only itself. Stub just that marker for this server-side unit test.
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../lib/password-email.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  external: ['nodemailer'],
  plugins: [
    {
      name: 'server-only-marker',
      setup(plugin) {
        plugin.onResolve({ filter: /^server-only$/ }, () => ({
          path: 'marker',
          namespace: 'empty',
        }));
        plugin.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
      },
    },
  ],
});
const { passwordEmailConfigured, sendPasswordEmail, notifyStudentWelcome } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);
const keys = ['EMAIL_PROVIDER', 'EMAIL_FROM', 'RESEND_API_KEY'];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  mock.restoreAll();
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test('welcome email uses verified student details and a profile link without credentials', async () => {
  configure();
  let payload;
  mock.method(globalThis, 'fetch', async (_, options) => {
    assert.equal(options.headers['Idempotency-Key'], 'student-welcome/42');
    payload = JSON.parse(options.body);
    return Response.json({ id: 'welcome-id' });
  });
  await notifyStudentWelcome({
    email: 'student@example.com',
    firstName: '<Enea>',
    classCode: '3CI',
    userId: 42,
    appUrl: 'https://sitopuntikeynes.it',
  });
  assert.deepEqual(payload.to, ['student@example.com']);
  assert.equal(payload.subject, 'Benvenuto su Keynes Grand Line');
  assert.ok(payload.text.includes('https://sitopuntikeynes.it/profilo'));
  assert.ok(payload.html.includes('&lt;Enea&gt;'));
  assert.ok(!payload.html.includes('<Enea>'));
  assert.ok(!payload.text.includes('token='));
});

test('welcome delivery failures do not fail registration and logs omit private data', async () => {
  configure();
  mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  const log = mock.method(console, 'error', () => {});
  await notifyStudentWelcome({
    email: 'student@example.com',
    firstName: 'Enea',
    classCode: '3CI',
    userId: 42,
    appUrl: 'https://sitopuntikeynes.it',
  });
  assert.deepEqual(log.mock.calls[0].arguments, ['Welcome email delivery failed']);
});

test('local registration works with email delivery disabled', async () => {
  configure();
  delete process.env.RESEND_API_KEY;
  const fetch = mock.method(globalThis, 'fetch', () => {
    throw new Error('Unexpected email');
  });
  await notifyStudentWelcome({
    email: 'student@example.com',
    firstName: 'Enea',
    classCode: '3CI',
    userId: 42,
    appUrl: 'https://sitopuntikeynes.it',
  });
  assert.equal(fetch.mock.calls.length, 0);
});
function configure() {
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.EMAIL_FROM = 'Keynes Grand Line <noreply@sitopuntikeynes.it>';
  process.env.RESEND_API_KEY = 'test-key';
}

test('Resend requires a sender and private API key before creating a reset email', () => {
  configure();
  assert.equal(passwordEmailConfigured(), true);
  delete process.env.RESEND_API_KEY;
  assert.equal(passwordEmailConfigured(), false);
  process.env.RESEND_API_KEY = 'test-key';
  delete process.env.EMAIL_FROM;
  assert.equal(passwordEmailConfigured(), false);
});

test('sends the real reset URL in both email formats through HTTPS', async () => {
  configure();
  const url = 'https://sitopuntikeynes.it/recupero?token=test&source=email';
  let payload;
  mock.method(globalThis, 'fetch', async (endpoint, options) => {
    assert.equal(endpoint, 'https://api.resend.com/emails');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.match(options.headers['Idempotency-Key'], /^password-reset\/[a-f0-9]{64}$/);
    assert.ok(options.signal);
    payload = JSON.parse(options.body);
    return Response.json({ id: 'test-message-id' });
  });
  await sendPasswordEmail('student@example.com', url);
  assert.deepEqual(payload.to, ['student@example.com']);
  assert.equal(payload.from, process.env.EMAIL_FROM);
  assert.ok(payload.text.includes(url));
  assert.ok(payload.html.includes(url.replace('&', '&amp;')));
  assert.ok(payload.text.includes('valido un’ora'));
});

test('provider errors fail the operation without exposing API response or secrets', async () => {
  configure();
  mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: 'private details' }, { status: 429 }),
  );
  await assert.rejects(
    sendPasswordEmail('student@example.com', 'https://sitopuntikeynes.it/recupero?token=test'),
    {
      message: 'Email service rejected request (429)',
    },
  );
});

test('does not report success without a provider message ID', async () => {
  configure();
  mock.method(globalThis, 'fetch', async () => Response.json({}));
  await assert.rejects(
    sendPasswordEmail('student@example.com', 'https://sitopuntikeynes.it/recupero?token=test'),
    {
      message: 'Email service did not acknowledge the message',
    },
  );
});
