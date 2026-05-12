# React Component Generator

An AI-powered React component generator that uses AWS Bedrock (Claude Sonnet 4.6) to create production-ready React components from natural language descriptions. Supports multi-file generation, npm packages, Vite-based HMR previews, and static exports—all running in isolated Docker containers.

## Features

- 🤖 **AI-Powered Generation** - Generate React components using Claude via AWS Bedrock
- 🎨 **Live Vite Preview** - Hot module replacement (HMR) with instant feedback
- 📦 **Multi-File Components** - Generate multiple files (components, utilities, styles)
- 🔌 **npm Package Support** - Install and use any npm package in generated components
- 💾 **Persistent Designs** - Designs stored in Docker volumes, survive container restarts
- 🚀 **Production Builds** - Vite builds with static exports (HTML/JS/CSS)
- 📥 **ZIP Export** - Download built components as standalone ZIP files
- 🐳 **Containerized** - Runs in Docker with isolated Vite dev servers (max 3 concurrent)
- 📝 **Code Editor** - Monaco Editor with TypeScript/JSX support
- 🔒 **Secure** - No XSS risks, proper sandboxing, server-side API only

## Architecture Overview

The application uses a **dual-mode** architecture:

- **Quick Mode** (backwards compatible): Single component generation via iframe+React CDN
- **Full Mode** (Vite-based): Multi-file projects with real npm packages, HMR, and production builds

```
User Prompt
    ↓
Next.js Server (port 3000)
    ├── /api/generate → Bedrock Claude
    ├── /api/designs → Design CRUD
    ├── /api/designs/[id]/packages → npm install
    ├── /api/designs/[id]/build → vite build
    └── /api/designs/[id]/preview/* → Proxy to Vite servers
         ↓
    Vite Dev Servers (ports 5173-5222)
         ↓
    Docker Volume: /designs (persistent storage)
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite 5 (for previews and static exports)
- **AI Provider**: AWS Bedrock (Claude Sonnet 4.6)
- **Code Editor**: Monaco Editor
- **Containerization**: Docker + Docker Compose
- **Package Manager**: npm

## Prerequisites

- **Local Development**: Node.js 18+
- **Docker Mode**: Docker & Docker Compose
- **AWS Account**: Bedrock access with Claude model enabled
- **AWS Credentials**: Valid IAM credentials with Bedrock permissions

## Quick Start

### Option 1: Local Development (Quick Mode)

```bash
# Install dependencies
npm install

# Create .env.local with AWS credentials
cat > .env.local << EOF
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6-20250514-v1:0
EOF

# Start development server
npm run dev
```

Visit http://localhost:3000 to start generating components.

### Option 2: Docker (Full Mode with Vite)

```bash
# Copy environment file
cp .env.example .env.local
# Edit .env.local with your AWS credentials

# Start Docker Compose
docker compose up

# Access the app
# http://localhost:3000 (Next.js)
# http://localhost:5173-5175 (Vite servers)
```

The Docker setup includes:
- Persistent design storage (`designs-data` volume)
- Automatic Vite server lifecycle management
- Shared dependencies via symlinked node_modules

## Usage Guide

### Generate a Simple Component (Quick Mode)

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A pricing card with three tiers"}'
```

### Generate Multi-File Project (Full Mode)

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A product gallery with Framer Motion animations",
    "mode": "full"
  }'
```

### Install Package in Design

```bash
curl -X POST http://localhost:3000/api/designs/{designId}/packages \
  -H "Content-Type: application/json" \
  -d '{"packageName": "framer-motion"}'
```

### Build and Export

```bash
# Trigger build
curl -X POST http://localhost:3000/api/designs/{designId}/build

# Download ZIP
curl http://localhost:3000/api/designs/{designId}/export --output design.zip
```

### Start/Stop Preview Server

```bash
# Start Vite server
curl -X POST http://localhost:3000/api/designs/{designId}/preview/start

# Check status
curl http://localhost:3000/api/designs/{designId}/preview/status

# Stop server
curl -X POST http://localhost:3000/api/designs/{designId}/preview/stop
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── designs/                    # Design CRUD
│   │   │   ├── route.ts               # GET/POST designs
│   │   │   └── [id]/
│   │   │       ├── route.ts           # GET/PUT/DELETE design
│   │   │       ├── files/route.ts     # Update design files
│   │   │       ├── build/route.ts     # Trigger vite build
│   │   │       ├── export/route.ts    # Download ZIP
│   │   │       ├── packages/route.ts  # npm install
│   │   │       └── preview/
│   │   │           ├── start/route.ts   # Start Vite server
│   │   │           ├── stop/route.ts    # Stop Vite server
│   │   │           └── status/route.ts  # Server status
│   │   ├── generate/route.ts          # AI generation (quick+full modes)
│   │   └── vite-servers/[id]/route.ts # Vite proxy
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── editor/                        # Monaco editor UI
│   ├── layout/                        # Main layout components
│   ├── preview/                       # Preview rendering
│   └── prompt/                        # Prompt input & history
├── hooks/
│   ├── use-generation.ts              # Generation state
│   └── use-preview.ts                 # Preview HTML builder
├── lib/
│   ├── bedrock-client.ts              # AWS Bedrock SDK client
│   ├── component-parser.ts            # Parse single-file responses
│   ├── design-service.ts              # Design file CRUD
│   ├── design-constants.ts            # Configuration constants
│   ├── enhanced-prompt-builder.ts     # Multi-file prompts
│   ├── package-service.ts             # npm package management
│   ├── port-pool.ts                   # Vite port allocation
│   ├── response-parser.ts             # Parse multi-file responses
│   ├── vite-project-template.ts       # Project scaffolding
│   └── vite-server-manager.ts         # Vite process lifecycle
└── types/
    └── index.ts                       # TypeScript definitions
```

## API Endpoints

### Design Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/designs` | List all designs |
| POST | `/api/designs` | Create new design |
| GET | `/api/designs/[id]` | Get design metadata + files |
| PUT | `/api/designs/[id]` | Update design metadata |
| DELETE | `/api/designs/[id]` | Delete design |
| PUT | `/api/designs/[id]/files` | Update design files |

### Package Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/designs/[id]/packages` | List installed packages |
| POST | `/api/designs/[id]/packages` | Install npm package |
| DELETE | `/api/designs/[id]/packages/[name]` | Uninstall package |

### Preview & Build

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/designs/[id]/preview/start` | Start Vite dev server |
| GET | `/api/designs/[id]/preview/status` | Get server status |
| POST | `/api/designs/[id]/preview/stop` | Stop Vite dev server |
| GET | `/api/designs/[id]/preview/*` | Proxy to Vite server |
| POST | `/api/designs/[id]/build` | Build to static files |
| GET | `/api/designs/[id]/export` | Download ZIP export |

### Generation

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/generate` | Generate component (mode=quick\|full) |

**Generation Request:**
```typescript
{
  prompt: string;           // Natural language description
  designId?: string;        // For mode=full (creates/updates design)
  mode?: "quick" | "full";  // Default: "quick"
  currentCode?: string;     // For iterations
}
```

**Quick Mode Response:**
```json
{
  "code": "import React from 'react'...",
  "explanation": "This component creates..."
}
```

**Full Mode Response:**
```json
{
  "designId": "abc123",
  "files": [
    { "path": "src/App.tsx", "content": "..." },
    { "path": "src/components/Card.tsx", "content": "..." }
  ],
  "packages": ["react", "react-dom", "tailwindcss"],
  "metadata": { "name": "Product Gallery", "prompt": "..." }
}
```

## Docker Configuration

### Environment Variables

```env
DESIGNS_PATH=/app/designs              # Design storage path
VITE_PORT_START=5173                   # Vite port range start
VITE_PORT_END=5222                     # Vite port range end (50 ports)
MAX_VITE_SERVERS=3                     # Max concurrent Vite servers
VITE_IDLE_TIMEOUT=300000               # Idle timeout (ms)
MAX_DESIGNS=50                         # Max number of designs
```

### Volume Mounts

- `designs-data`: Persistent storage for generated designs
- Survives container restarts
- Independent Vite projects per design
- Shared base `node_modules` via symlinks

## Design File Structure

Each design is a complete Vite project:

```
/designs/{designId}/
├── index.html              # Vite entry HTML
├── package.json            # Design dependencies
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript config
├── tailwind.config.ts      # Tailwind config
├── postcss.config.mjs      # PostCSS config
├── src/
│   ├── main.tsx           # Vite entry point (mounts App)
│   ├── App.tsx            # Generated root component
│   ├── components/        # Generated sub-components
│   └── index.css          # Tailwind directives
├── dist/                  # Build output (after `vite build`)
├── node_modules/          # Design-specific + symlinked base deps
└── metadata.json          # Name, prompt history, timestamps
```

## Key Features Explained

### Hot Module Replacement (HMR)

When using Full Mode with Vite:
- Edit file via API → automatically saved to disk
- Vite detects changes → HMR pushes update to browser
- No manual refresh needed
- Instant feedback (~100ms typical)

### Package Management

```bash
# Install package
POST /api/designs/{id}/packages
{ "packageName": "framer-motion" }

# Behind the scenes:
# 1. npm install in design folder
# 2. Updates package.json
# 3. Vite detects changes (if server running)
# 4. HMR refreshes preview
```

### Production Build

```bash
# Trigger build
POST /api/designs/{id}/build

# Behind the scenes:
# 1. Runs `vite build` in design folder
# 2. Generates dist/ with optimized static files
# 3. HTML + JS + CSS ready for deployment
```

### Export as ZIP

```bash
# Download design
GET /api/designs/{id}/export

# Returns: design.zip containing dist/ folder
# Deployable to Vercel, Netlify, GitHub Pages, S3, etc.
```

### Port Management

- Dynamic allocation from pool: 5173-5222 (50 ports)
- LRU eviction: Stop oldest server when limit (3) reached
- Idle cleanup: Stop servers unused for 5+ minutes
- Thread-safe: Mutex-protected port allocation

## Security Considerations

- **AWS Credentials**: Never exposed to client, server-side only
- **Sandboxing**: Each design in isolated folder + container
- **Port Isolation**: Vite servers accessible only via proxy API route
- **File Validation**: Path traversal prevention (`../` blocked)
- **Resource Limits**: Max 50 designs, max 3 concurrent servers
- **Process Management**: Graceful shutdown, zombie prevention

## Performance Optimizations

- **Shared Dependencies**: Symlinked `node_modules` saves ~200MB per design
- **LRU Eviction**: Only 3 Vite servers running at a time
- **Lazy Server Start**: Vite servers spawn on-demand (not pre-warmed)
- **Port Pool**: Efficient port allocation and reuse
- **Debounced Updates**: Preview updates debounced (500ms)

## Troubleshooting

### "Vite server failed to start"
- Check `/app/designs/{id}` exists and is readable
- Verify npm dependencies installed
- Check port availability (5173-5222)
- Review Vite logs in container

### "npm install hangs"
- Set timeout: default 60 seconds
- Check internet connectivity in container
- Verify npm registry accessibility

### "Package not found after install"
- Verify package.json updated
- Check design folder permissions
- Try restarting Vite server
- Confirm package is valid npm package

### "Preview doesn't update after file edit"
- Ensure Vite server is running: `GET /api/designs/{id}/preview/status`
- Check browser console for HMR errors
- Try manual refresh (Cmd+R / Ctrl+R)
- Verify file was saved correctly

### "Docker volume not persisting"
- Check volume mount: `docker volume ls`
- Verify volume backed by actual storage
- Restart Docker daemon if needed

## Build & Deployment

### Local Build

```bash
npm run build
npm start
```

### Docker Build

```bash
# Development
docker compose up

# Production
docker build --target prod -t react-gen:latest .
docker run -p 3000:3000 -e AWS_REGION=... react-gen:latest
```

### Deploy to Production

**Vercel** (Quick Mode only):
```bash
vercel deploy
```

**AWS ECS** (Full Docker support):
```bash
# Push image to ECR
aws ecr push react-gen:latest

# Deploy ECS task with volume mount
```

**Self-hosted**:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Development

### Run Tests

```bash
npm test
```

### Watch Mode

```bash
npm run dev
```

### Build TypeScript

```bash
npm run build
```

### Linting

```bash
npm run lint
```

## Monitoring & Debugging

### Check Running Vite Servers

```bash
# Inside container
ps aux | grep vite
# or
curl http://localhost:3000/api/vite-servers
```

### View Design Files

```bash
# Inside container
docker compose exec app ls -la /app/designs/{designId}
```

### Stream Container Logs

```bash
docker compose logs -f app
```

### Interactive Shell

```bash
docker compose exec app /bin/bash
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Related Documentation

- [Architecture Guide](./docs/system-architecture.md) - Detailed system design
- [API Reference](./docs/api-reference.md) - Complete API documentation
- [Development Guide](./docs/development-guide.md) - For contributors
- [Deployment Guide](./docs/deployment-guide.md) - Production setup
