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
