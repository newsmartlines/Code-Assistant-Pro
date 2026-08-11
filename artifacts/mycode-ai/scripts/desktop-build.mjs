import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'vite', 'build', '--config', 'vite.config.ts'],
  {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      BASE_PATH: '/',
      PORT: '1420',
    },
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);