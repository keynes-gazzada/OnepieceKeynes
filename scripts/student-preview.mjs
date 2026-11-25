import { spawn } from 'node:child_process';
import { join } from 'node:path';

// An isolated local database prevents demonstration accounts from entering real rankings.
const child = spawn(
  process.execPath,
  [
    join(process.cwd(), 'node_modules/next/dist/bin/next'),
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3002',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_DRIVER: 'sqlite',
      DATABASE_PATH: join(process.cwd(), '.data', 'student-preview.sqlite'),
      ENABLE_DEMO_DATA: 'true',
      ENABLE_STUDENT_PREVIEW: 'true',
      ADMIN_EMAIL: '',
      ADMIN_PASSWORD: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      SUPABASE_DATABASE_URL: '',
      RESEND_API_KEY: '',
      SMTP_HOST: '',
      NEXT_DIST_DIR: '.next-student-preview',
    },
  },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
