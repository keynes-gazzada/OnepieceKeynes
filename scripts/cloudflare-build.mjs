import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Building does not query Hyperdrive. Supply a dummy local connection for its emulator.
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
        process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ||
        'postgres://build:build@localhost:5432/postgres',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
