import { spawn } from 'node:child_process';

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'],
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

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});