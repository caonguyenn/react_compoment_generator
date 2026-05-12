# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server (port 3000)
npm run build        # Production build (also validates TypeScript)
npm run lint         # ESLint
npm run docker:dev   # Docker Compose (Full Mode with Vite servers)
npm run docker:stop  # Stop containers
```

No test runner is configured. The `scripts/` folder has manual test scripts for Vite server management.

## Architecture

**Dual-mode AI component generator** using Next.js 14 App Router + AWS Bedrock (Claude):

- **Quick Mode**: Single-file generation → iframe preview via React CDN
- **Full Mode**: Multi-file Vite projects → real npm packages, HMR preview, production builds, ZIP export

### Key Data Flow (Full Mode)

```
User prompt → /api/generate (mode=full)
  → Bedrock Claude (ConverseCommand)
  → response-parser.ts (extracts files + deps)
  → design-service.ts (writes files to disk)
  → package-service.ts (npm install, fire-and-forget)
  → vite-server-manager.ts (spawns/manages Vite dev server)
  → Client polls preview via /api/designs/[id]/preview/*
```

### Singleton Services (server-side)

All server-side services are singletons — imported once, shared across requests:

- `designService` — CRUD for design folders on disk (`./designs/{id}/`)
- `viteServerManager` — spawns/stops Vite child processes, LRU eviction, idle timeout
- `packageService` — runs `npm install` in design folders
- `PortPool` — allocates ports 5173–5222 for Vite servers

### Design Storage

Each design is a self-contained Vite project at `DESIGNS_BASE_PATH/{id}/` (default `./designs/`). Designs share base `node_modules` via symlink to `designs/_shared/node_modules`. Per-design deps are installed into the design's own `package.json`.

### Client State

Single-page app in `src/app/page.tsx` orchestrates all hooks:
- `useDesigns` — design list CRUD
- `useGeneration` — AI generation + chat history
- `useVitePreview` — Vite server lifecycle (start/stop/status polling)
- `usePackages` — npm package management
- `usePreview` — Quick Mode HTML builder

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).

## Environment

Required in `.env.local`:
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-6
```

Docker-specific (set via docker-compose):
```
DESIGNS_PATH=/app/designs
VITE_PORT_START=5173
VITE_PORT_END=5222
MAX_VITE_SERVERS=3
```

## Important Constraints

- `tsconfig.json` excludes `designs/**` — generated design projects are not type-checked by the host
- `next.config.mjs` ignores `**/designs/**` in webpack watch
- File writes in `design-service.ts` use atomic write pattern (write to `.tmp`, then `rename`)
- Path traversal is blocked: all design file operations must be within `src/` subdirectory
- Max 50 designs, max 30 files per design, max 500KB per file, max 5 new deps per generation
- Max 3 concurrent Vite servers (LRU eviction), 5-minute idle timeout
