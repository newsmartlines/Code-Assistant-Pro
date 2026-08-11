# MyCode AI desktop shell

This directory is the Tauri v2 shell for the MyCode AI frontend. Phase 2
connects the local workspace explorer, editor saves, external-change polling,
terminal commands, and basic Git status/diff operations through explicit native
commands. The autonomous Agent remains intentionally disabled.

## Windows setup

Install the current stable Rust toolchain, Microsoft Visual Studio Build Tools
with the Desktop development with C++ workload, and the WebView2 runtime.

From this repository:

```powershell
pnpm install
pnpm --filter @workspace/mycode-ai run desktop:dev
```

To build Windows installers:

```powershell
pnpm --filter @workspace/mycode-ai run desktop:build
```

Installers are emitted under `artifacts/mycode-ai/src-tauri/target/release/bundle/`.
On a Windows machine this creates the NSIS `.exe` installer and the WiX `.msi`
installer configured in `tauri.conf.json`.

The Windows package uses the `cmd /C` command runner and keeps file operations
inside the folder selected by the user. Windows installer generation must be
run on Windows; Linux can validate the frontend and Rust compilation but cannot
produce the NSIS/MSI artifacts.