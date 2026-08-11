import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';

// See desktop-dev.mjs for the full explanation. Short version: `shell: true`
// is required on Windows because pnpm.cmd can't be exec'd directly since
// Node's CVE-2024-27980 fix, and the command is plain 'pnpm' (not
// 'pnpm.cmd') so cmd.exe's own PATHEXT resolution finds whichever
// executable form (.cmd/.exe/.ps1) is actually on this machine's PATH.
const result = spawnSync('pnpm', ['exec', 'vite', 'build', '--config', 'vite.config.ts'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: {
    ...process.env,
    BASE_PATH: '/',
    PORT: '1420',
  },
  stdio: 'inherit',
  shell: isWindows,
});

if (result.error) {
  console.error('[desktop-build] Failed to launch pnpm:', result.error);
  console.error(
    '[desktop-build] Make sure "pnpm" is on PATH (run `pnpm --version` in this same terminal to confirm).',
  );
  process.exit(1);
}

process.exit(result.status ?? 1);