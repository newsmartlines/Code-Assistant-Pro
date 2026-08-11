import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';

// Why `shell: true` on Windows:
// pnpm is installed as a .cmd (or .ps1) shim, not a real PE executable.
// Since Node 18.20.2/20.12.2/21.7.3 (CVE-2024-27980), spawn() refuses to
// exec .bat/.cmd files directly and throws `spawn EINVAL` immediately -
// this is Node's own documented, intentional fix, not a bug to work around.
// The only supported fix is `shell: true` (routes the call through
// cmd.exe) or invoking cmd.exe explicitly.
//
// Why the command is plain `'pnpm'` (not hardcoded 'pnpm.cmd'):
// pnpm ships different executable extensions depending on how it was
// installed - `pnpm.cmd` (npm/corepack global installs) vs `pnpm.exe`
// (the standalone Windows installer) vs `pnpm.ps1`. Hardcoding one
// extension breaks the other install methods. With `shell: true`, cmd.exe
// itself resolves `pnpm` against PATH using PATHEXT (.COM/.EXE/.BAT/.CMD),
// exactly like typing `pnpm` at a normal Windows terminal - so it works
// regardless of install method.
//
// Args stay as an array (not a hand-built string), so Node still quotes
// each argument for cmd.exe itself, which keeps this safe for project
// paths containing spaces (e.g. "D:\...\Mini Cursor\5\...").
const child = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: {
    ...process.env,
    BASE_PATH: '/',
    PORT: '1420',
  },
  stdio: 'inherit',
  shell: isWindows,
});

child.on('error', (err) => {
  console.error('[desktop-dev] Failed to launch pnpm:', err);
  console.error(
    '[desktop-dev] Make sure "pnpm" is on PATH (run `pnpm --version` in this same terminal to confirm).',
  );
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});