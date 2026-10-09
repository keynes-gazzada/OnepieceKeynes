import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: join(tmpdir(), `one-piece-keynes-playwright-${process.pid}`),
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PATH: process.env.PATH || '',
      NODE_ENV: 'development',
      DATABASE_DRIVER: 'sqlite',
      SUPABASE_DATABASE_URL: '',
      NEXT_DIST_DIR: '.next/playwright-tests',
      DATABASE_PATH: join(tmpdir(), `one-piece-keynes-playwright-${process.pid}.sqlite`),
    },
  },
});
