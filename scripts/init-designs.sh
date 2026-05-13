#!/bin/bash
set -e

SHARED_DIR="/app/designs/_shared"

# Create shared directory structure if it doesn't exist
mkdir -p "$SHARED_DIR"

# Ensure .npmrc for flat hoisting (symlink strategy requires it)
if [ ! -f "$SHARED_DIR/.npmrc" ]; then
  echo "shamefully-hoist=true" > "$SHARED_DIR/.npmrc"
fi

# Copy package.json if it doesn't exist in the volume
if [ ! -f "$SHARED_DIR/package.json" ]; then
  echo "Initializing shared dependencies package.json..."
  cat > "$SHARED_DIR/package.json" <<'EOF'
{
  "name": "designs-shared-deps",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
EOF
fi

# Install shared base dependencies if not already installed
if [ ! -d "$SHARED_DIR/node_modules" ]; then
  echo "Installing shared base dependencies..."
  cd "$SHARED_DIR"
  pnpm install
  echo "Shared dependencies installed."
fi

# Start Next.js dev server
cd /app
exec pnpm run dev
