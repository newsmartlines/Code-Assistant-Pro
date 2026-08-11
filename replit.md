# MyCode AI

MyCode AI is a desktop-first coding workspace with an editor, explorer, agent surface, terminal, settings, and a Tauri v2 shell for local Windows project work.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/mycode-ai run dev` — run the browser preview
- `pnpm --filter @workspace/mycode-ai run desktop:dev` — run the Tauri desktop shell locally
- `pnpm --filter @workspace/mycode-ai run desktop:build` — build Windows installers
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required for the browser preview: no provider credentials are needed because native capabilities are intentionally disabled there.
- Required for the desktop Agent: one provider key in the native desktop environment — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mycode-ai/src/App.tsx` — active Phase 2 workspace entry
- `artifacts/mycode-ai/src/AppPhase2.tsx` — explorer, tabs, editor, terminal, Git, settings, and Agent placeholder
- `artifacts/mycode-ai/src/index.css` — dark IDE theme and responsive layout
- `artifacts/mycode-ai/src/native/contracts.ts` — future AgentEngine, AIProvider, Tool, Workspace, indexing, terminal, Git, file, preview, and permission boundaries
- `artifacts/mycode-ai/src-tauri/` — Tauri v2 Windows desktop shell, native commands, and minimal permissions

## Architecture decisions

- The browser preview is an honest fallback: sample files are editable locally, but native filesystem, terminal, Git, preview, and AI operations are not faked.
- The desktop shell is Tauri v2 and starts with only core permissions; capabilities should be added behind explicit PermissionManager decisions.
- Native boundaries are represented by TypeScript contracts so future provider and workspace implementations can be swapped without coupling the UI to one vendor.

## Agent Core (Phase 3)

Phase 3 adds a provider-agnostic native Agent Engine. It searches and reads a constrained local workspace, asks Anthropic, OpenAI, Gemini, or OpenRouter for a structured JSON plan, previews complete-file edits as a diff, waits for explicit user approval, applies safe multi-file changes (including new files), runs allowlisted verification commands, and exposes failed output for another feedback iteration. Provider keys are read by Tauri only and are never handled by the browser preview.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Windows desktop builds require Rust, Microsoft Visual Studio Build Tools with Desktop development with C++, and WebView2.
- The frontend can be previewed in Replit, but local folders and native commands only become available inside the Tauri shell.
- Agent commands and provider adapters are also desktop-only. If a key is missing, the UI reports the exact environment variable to configure.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
