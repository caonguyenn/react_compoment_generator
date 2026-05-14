# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server (port 3000)
npm run build        # Production build (also validates TypeScript)
npm run lint         # ESLint
npm run docker:dev   # Docker Compose (mounts Docker socket for DooD)
npm run docker:stop  # Stop containers
```

No test runner is configured. The `scripts/` folder has manual test scripts for Vite and Docker container management.

**Docker Socket Mount Required**: For Dynamic Mode (DooD), docker-compose.yml mounts `/var/run/docker.sock` to allow container orchestration from within the app container.

## Architecture

**Triple-mode AI component generator** using Next.js 14 App Router + AWS Bedrock (Claude):

- **Quick Mode**: Single-file generation → iframe preview via React CDN
- **Static Mode**: Multi-file Vite projects → real npm packages, HMR preview, production builds, ZIP export
- **Dynamic Mode**: Containerized Next.js + PostgreSQL → full-stack apps with database, DooD architecture

### Key Data Flow (Static Mode - Vite)

```
User prompt → /api/generate (mode=full)
  → Bedrock Claude (ConverseCommand, maxTokens=32000)
  → response-parser.ts (extracts files + deps + deleted files)
  → css-validator.ts (validates imports, detects missing files)
  → syntax-validator.ts (checks for truncated/incomplete files)
  → design-service.ts (writes files to disk, deletes removed files)
  → packageService (pnpm install, fire-and-forget)
  → vite-server-manager.ts (spawns/manages Vite dev server)
  → Client polls preview via /api/designs/[id]/preview/*
  → If truncated: client calls /api/designs/[id]/continue to generate remaining files
```

### Key Data Flow (Dynamic Mode - Docker Compose)

```
User prompt → /api/generate (mode=full, designMode=dynamic)
  → Bedrock Claude with dynamic-prompt-builder (Next.js + Prisma)
  → response-parser.ts (extracts files + Prisma schema + deps + deleted files)
  → css-validator.ts + syntax-validator.ts (validates completeness)
  → design-service.ts (scaffolds Next.js project with docker-compose.yml)
  → docker-design-manager.ts (manages Docker Compose lifecycle):
      → Updates port binding in docker-compose.yml
      → `docker compose up -d --build` (project name: design-{id})
      → Compose handles: network creation, Postgres healthcheck, service dependencies
      → Volume mount for live code editing, persistent pgdata volume
  → Client proxies requests via /api/designs/[id]/preview/proxy/*
  → If truncated: client calls /api/designs/[id]/continue to generate remaining files
```

### Singleton Services (server-side)

All server-side services are singletons — imported once, shared across requests:

- `designService` — CRUD for design folders on disk (`./designs/{id}/`), scaffolds Vite or Next.js projects based on mode, supports file deletion
- `viteServerManager` — spawns/stops Vite child processes, LRU eviction (max 3), 5-min idle timeout
- `dockerDesignManager` — manages Docker Compose stacks for dynamic mode, LRU eviction (max 3), 10-min idle timeout
- `packageService` — runs `pnpm install` in design folders
- `PortPool` — allocates ports (5173–5222 for Vite, 6001–6100 for Docker)

### Validation & Truncation Handling

- `css-validator.ts` — validates imports across generated files, detects references to missing files (truncation indicator)
- `syntax-validator.ts` — uses TypeScript AST to detect incomplete/truncated code (unclosed braces, missing exports)
- `response-parser.ts` — parses `---DELETED---` section, flags `hasIncompleteFiles` when truncation detected
- `/api/designs/[id]/continue` — continuation endpoint: re-invokes AI to generate remaining files when response was truncated
- Prompt builders enforce incremental updates: only new/modified files are output, unchanged files are omitted

### Design Storage

Each design is a self-contained project at `DESIGNS_BASE_PATH/{id}/` (default `./designs/`):

- **Static Mode**: Vite project with shared `node_modules` via symlink to `designs/_shared/node_modules`
- **Dynamic Mode**: Next.js project with Prisma schema + docker-compose.yml for stack orchestration

Per-design deps are installed into the design's own `package.json`. Dynamic designs get:
- `docker-compose.yml` with app + db services
- Persistent PostgreSQL volume (`design-{id}-pgdata`)
- Volume mount for live code editing (no rebuild needed for code changes)

### Client State

Single-page app in `src/app/page.tsx` orchestrates all hooks:
- `useDesigns` — design list CRUD, mode selection (static/dynamic)
- `useGeneration` — AI generation + chat history + continuation for truncated responses
- `useVitePreview` — Vite server lifecycle (start/stop/status polling), SSE for dynamic mode container startup
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

# Static Mode (Vite)
VITE_PORT_START=5173
VITE_PORT_END=5222
MAX_VITE_SERVERS=3

# Dynamic Mode (DooD)
DOCKER_ENABLED=true
DOCKER_PORT_START=6001
DOCKER_PORT_END=6100
MAX_DOCKER_STACKS=3
DOCKER_IDLE_TIMEOUT=600000
DYNAMIC_POSTGRES_PASSWORD=your_secure_password
```

## Important Constraints

- `tsconfig.json` excludes `designs/**` — generated design projects are not type-checked by the host
- `next.config.mjs` ignores `**/designs/**` in webpack watch
- File writes in `design-service.ts` use atomic write pattern (write to `.tmp`, then `rename`)
- Path traversal is blocked: all design file operations must be within `src/` subdirectory
- Max 50 designs, max 50 files per design, max 500KB per file, max 5 new deps per generation
- Max 3 concurrent Vite servers (LRU eviction), 5-minute idle timeout
- Max 3 concurrent Docker stacks (LRU eviction), 10-minute idle timeout
- Design ID validation: 12-char nanoid format (prevents command injection in Docker commands)
- Prisma schema validation: blocks `generator`/`datasource` directives and shell commands
- AI output token limit: 32000 (near Claude max) — truncation is detected and handled via continuation endpoint
- Incremental updates: AI only outputs new/modified files; unchanged files remain on disk
- File deletion: AI can mark files for removal via `---DELETED---` response section
