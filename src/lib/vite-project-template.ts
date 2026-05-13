export function getIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Design Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function getPackageJson(id: string): string {
  return JSON.stringify(
    {
      name: `design-${id}`,
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
    },
    null,
    2
  );
}

export function getViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    hmr: false,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../_shared/node_modules'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
`;
}

export function getTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
      },
      include: ['src'],
    },
    null,
    2
  );
}

export function getPostCssConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}

export function getTailwindConfig(): string {
  return `export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
`;
}

export function getMainTsx(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

export function getIndexCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
}

export function getDefaultAppTsx(): string {
  return `export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-bold">Design Preview</h1>
    </div>
  );
}
`;
}

export function getNpmrc(): string {
  return 'shamefully-hoist=true\n';
}
