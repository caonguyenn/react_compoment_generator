/**
 * Next.js 14 App Router + Prisma project templates for dynamic designs
 */

export function getPackageJson(id: string): string {
  return JSON.stringify(
    {
      name: `design-${id}`,
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev -p 3000',
        build: 'next build',
        start: 'next start -p 3000',
      },
      dependencies: {
        next: '14.2.35',
        react: '^18',
        'react-dom': '^18',
        '@prisma/client': '^5',
        tailwindcss: '^3',
        autoprefixer: '^10',
        postcss: '^8',
        'lucide-react': '^0.400.0',
        clsx: '^2',
        'tailwind-merge': '^2',
      },
      devDependencies: {
        prisma: '^5',
        typescript: '^5',
        '@types/node': '^20',
        '@types/react': '^18',
        '@types/react-dom': '^18',
      },
    },
    null,
    2
  );
}

export function getNextConfig(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;
}

export function getTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [
          {
            name: 'next',
          },
        ],
        paths: {
          '@/*': ['./src/*'],
        },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    },
    null,
    2
  );
}

export function getTailwindConfig(): string {
  return `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
`;
}

export function getPostCssConfig(): string {
  return `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}

export function getPrismaSchema(): string {
  return `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// AI-generated models will be inserted here
`;
}

export function getRootLayout(): string {
  return `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Generated App",
  description: "AI-generated Next.js application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
`;
}

export function getDefaultPage(id: string): string {
  return `export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Hello from design ${id}
        </h1>
        <p className="text-gray-600">
          This is a placeholder page. AI will generate the real content.
        </p>
      </div>
    </div>
  );
}
`;
}

export function getGlobalsCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: Arial, Helvetica, sans-serif;
}
`;
}

export function getPrismaClient(): string {
  return `import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
`;
}
