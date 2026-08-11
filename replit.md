# MyCode AI

MyCode AI is a desktop-first coding workspace with an editor, explorer, agent surface, terminal, settings, and a Tauri v2 shell for local Windows project work.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/mycode-ai run dev` — run the browser preview
- `pnpm --filter @workspace/mycode-ai run desktop:dev` — run the Tauri desktop shell locally
- `pnpm --filter @workspace/mycode-ai run desktop:build` — build Windows installers
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The browser preview includes a read-only Agent path through `/api/agent/ask`. It sends only sample/open-file context to the API server and requires one provider key on the server — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY`.
- The desktop Agent reads its provider key natively in Tauri and can inspect local files, propose reviewable edits, apply only after approval, and verify allowlisted commands.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mycode-ai/src/App.tsx` — active Phase 2 workspace entry
- `artifacts/mycode-ai/src/AppPhase2.tsx` — explorer, tabs, editor, terminal, Git, settings, and browser/native Agent surfaces
- `artifacts/mycode-ai/src/index.css` — dark IDE theme and responsive layout
- `artifacts/mycode-ai/src/native/contracts.ts` — future AgentEngine, AIProvider, Tool, Workspace, indexing, terminal, Git, file, preview, and permission boundaries
- `artifacts/mycode-ai/src-tauri/` — Tauri v2 Windows desktop shell, native commands, and minimal permissions

## Architecture decisions

- The browser preview is an honest fallback: sample files are editable locally, native filesystem/terminal/Git operations are not faked, and the browser Agent is restricted to a server-side read-only virtual workspace.
- The desktop shell is Tauri v2 and starts with only core permissions; capabilities should be added behind explicit PermissionManager decisions.
- Native boundaries are represented by TypeScript contracts so future provider and workspace implementations can be swapped without coupling the UI to one vendor.

## Agent Core (Phase 3)

Phase 3 adds provider-agnostic Agent paths. The native Tauri Agent searches and reads a constrained local workspace, asks Anthropic, OpenAI, Gemini, or OpenRouter for a structured JSON plan, previews complete-file edits as a diff, waits for explicit user approval, applies safe multi-file changes, runs allowlisted verification commands, and exposes failed output for another feedback iteration. The browser preview uses the API server for conversational read/list/search tool calls and never modifies files.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Windows desktop builds require Rust, Microsoft Visual Studio Build Tools with Desktop development with C++, and WebView2.
- The frontend can be previewed in Replit, but local folders and native commands only become available inside the Tauri shell.
- Native Agent commands/provider adapters are desktop-only; browser Agent responses require the matching provider key on the API server. If a key is missing, the UI reports the exact environment variable to configure.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
