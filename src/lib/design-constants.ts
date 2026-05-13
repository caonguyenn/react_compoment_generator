export const DESIGNS_BASE_PATH = process.env.DESIGNS_PATH || './designs';
export const SHARED_PATH = `${DESIGNS_BASE_PATH}/_shared`;
export const SHARED_NODE_MODULES = `${SHARED_PATH}/node_modules`;
export const MAX_DESIGNS = 50;
export const METADATA_FILE = 'metadata.json';
export const DESIGN_SRC_DIR = 'src';
export const MAX_FILE_SIZE = 500 * 1024; // 500KB
export const MAX_FILES_PER_DESIGN = 30;

// Vite server manager constants
export const VITE_PORT_START = parseInt(process.env.VITE_PORT_START || '5173', 10);
export const VITE_PORT_END = parseInt(process.env.VITE_PORT_END || '5222', 10);
export const MAX_VITE_SERVERS = parseInt(process.env.MAX_VITE_SERVERS || '3', 10);
export const VITE_IDLE_TIMEOUT = parseInt(process.env.VITE_IDLE_TIMEOUT || '300000', 10); // 5 minutes
export const VITE_STARTUP_TIMEOUT = 10000; // 10 seconds

// Docker dynamic mode constants
export const DOCKER_ENABLED = process.env.DOCKER_ENABLED !== 'false';
export const DOCKER_PORT_START = parseInt(process.env.DOCKER_PORT_START || '6001', 10);
export const DOCKER_PORT_END = parseInt(process.env.DOCKER_PORT_END || '6100', 10);
export const MAX_DOCKER_STACKS = parseInt(process.env.MAX_DOCKER_STACKS || '3', 10);
export const DOCKER_IDLE_TIMEOUT = parseInt(process.env.DOCKER_IDLE_TIMEOUT || '600000', 10); // 10 min
export const DOCKER_STARTUP_TIMEOUT = parseInt(process.env.DOCKER_STARTUP_TIMEOUT || '60000', 10); // 60s
export const POSTGRES_IMAGE = process.env.POSTGRES_IMAGE || 'postgres:16-alpine';
export const NEXTJS_APP_IMAGE = process.env.NEXTJS_APP_IMAGE || 'node:20-alpine';
export const DOCKER_LABEL = 'react-gen=true';
export const POSTGRES_PASSWORD = (() => {
  // Allow build-time without password (will fail at runtime if needed)
  const password = process.env.DYNAMIC_POSTGRES_PASSWORD;
  if (!password && typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    // Server-side production without password - log warning but don't fail build
    console.warn('[SECURITY] DYNAMIC_POSTGRES_PASSWORD not set in production');
    return 'CHANGE_ME_IN_PRODUCTION';
  }
  return password || 'devpassword';
})();
