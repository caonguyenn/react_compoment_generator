/**
 * CSS validation and auto-fix utilities
 * Prevents common CSS errors in generated files
 */

interface ValidationResult {
  valid: boolean;
  fixed?: string;
  errors: string[];
}

/**
 * Fix next.config.mjs to allow common external image domains
 */
export function fixNextConfigImages(content: string): string {
  // If already has images.remotePatterns, don't modify
  if (content.includes('remotePatterns')) {
    return content;
  }

  // Find the config object
  const configMatch = content.match(/const\s+nextConfig\s*=\s*\{([^}]*)\}/s);
  if (!configMatch) {
    return content;
  }

  // Add images config before the closing brace
  const imageConfig = `
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
  },`;

  return content.replace(
    /const\s+nextConfig\s*=\s*\{/,
    `const nextConfig = {${imageConfig}`
  );
}

/**
 * Validate and auto-fix globals.css content
 */
export function validateAndFixCSS(content: string): ValidationResult {
  const errors: string[] = [];
  let fixed = content;

  // Check 1: Find @apply with undefined variables (e.g., border-border)
  const applyMatches = Array.from(content.matchAll(/@apply\s+([^;]+);/g));
  const undefinedClasses: string[] = [];

  for (const match of applyMatches) {
    const classes = match[1].split(/\s+/);
    for (const cls of classes) {
      // Check for classes that look like CSS variable references
      if (cls.match(/^border-\w+$/) && !cls.match(/^border-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black|transparent|current)-/)) {
        undefinedClasses.push(cls);
      }
    }
  }

  // Fix: Remove problematic @apply lines with undefined variables
  if (undefinedClasses.length > 0) {
    errors.push(`Found @apply with undefined classes: ${undefinedClasses.join(', ')}`);

    // Remove lines with border-border, ring-ring, etc.
    fixed = fixed.replace(/\s*\*\s*{\s*@apply\s+border-\w+[^}]*}\s*/g, '');

    // Add standard border reset if removed
    if (!fixed.includes('@layer base') || !fixed.includes('border-gray')) {
      const baseLayerMatch = fixed.match(/@layer base\s*{/);
      if (baseLayerMatch) {
        const insertPos = baseLayerMatch.index! + baseLayerMatch[0].length;
        fixed = fixed.slice(0, insertPos) +
                '\n  * {\n    @apply border-gray-200;\n  }\n' +
                fixed.slice(insertPos);
      }
    }
  }

  // Check 2: Ensure CSS variables are defined before use
  const varUsageMatches = Array.from(content.matchAll(/var\(--(\w+)\)/g));
  const usedVars = new Set<string>();
  for (const match of varUsageMatches) {
    usedVars.add(match[1]);
  }

  const definedVars = new Set<string>();
  const varDefMatches = Array.from(content.matchAll(/--(\w+):\s*[^;]+;/g));
  for (const match of varDefMatches) {
    definedVars.add(match[1]);
  }

  const undefinedVars = Array.from(usedVars).filter(v => !definedVars.has(v));
  if (undefinedVars.length > 0) {
    errors.push(`Used CSS variables not defined: ${undefinedVars.join(', ')}`);

    // Add missing variable definitions
    const rootMatch = fixed.match(/:root\s*{/);
    if (rootMatch) {
      const commonVars: Record<string, string> = {
        border: '#e5e7eb',
        input: '#f3f4f6',
        ring: '#93c5fd',
        background: '#ffffff',
        foreground: '#171717',
        primary: '#6366f1',
        secondary: '#9ca3af',
      };

      let additions = '';
      for (const varName of undefinedVars) {
        if (commonVars[varName]) {
          additions += `\n  --${varName}: ${commonVars[varName]};`;
        }
      }

      if (additions) {
        const insertPos = rootMatch.index! + rootMatch[0].length;
        fixed = fixed.slice(0, insertPos) + additions + fixed.slice(insertPos);
      }
    }
  }

  // Check 3: Ensure Tailwind directives are present
  if (!content.includes('@tailwind base')) {
    errors.push('Missing @tailwind base directive');
    fixed = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n' + fixed;
  }

  return {
    valid: errors.length === 0,
    fixed: errors.length > 0 ? fixed : undefined,
    errors,
  };
}

/**
 * Validate Tailwind config
 */
export function validateTailwindConfig(content: string): ValidationResult {
  const errors: string[] = [];

  // Check if content paths are defined
  if (!content.includes('content:')) {
    errors.push('Missing content configuration');
  }

  // Check if it includes app directory
  if (!content.includes('./src/app/')) {
    errors.push('Missing ./src/app/ in content paths');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract import paths from TypeScript/TSX content
 */
export function extractImports(content: string): string[] {
  const imports: string[] = [];
  // Match: import ... from '@/...' or import ... from './...'
  const importRegex = /import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([@./][^'"]+)['"]/g;
  const matches = Array.from(content.matchAll(importRegex));
  for (const match of matches) {
    imports.push(match[1]);
  }
  return imports;
}

/**
 * Validate that all imports reference existing files
 */
export function validateImports(
  files: Array<{ path: string; content: string }>
): { missingImports: Array<{ file: string; import: string }> } {
  const missingImports: Array<{ file: string; import: string }> = [];
  const filePaths = new Set(files.map(f => f.path));

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    const imports = extractImports(file.content);
    for (const imp of imports) {
      // Skip external packages
      if (!imp.startsWith('@/') && !imp.startsWith('./') && !imp.startsWith('../')) continue;

      // Convert @/ alias to src/
      let resolvedPath = imp.replace('@/', 'src/');

      // Handle relative imports
      if (imp.startsWith('./') || imp.startsWith('../')) {
        const fileDir = file.path.substring(0, file.path.lastIndexOf('/'));
        resolvedPath = resolveRelativePath(fileDir, imp);
      }

      // Add .tsx/.ts extension if missing
      if (!resolvedPath.match(/\.\w+$/)) {
        const candidates = [
          resolvedPath + '.tsx',
          resolvedPath + '.ts',
          resolvedPath + '/index.tsx',
          resolvedPath + '/index.ts',
        ];
        const found = candidates.some(c => filePaths.has(c));
        if (!found) {
          missingImports.push({ file: file.path, import: imp });
        }
      } else if (!filePaths.has(resolvedPath)) {
        missingImports.push({ file: file.path, import: imp });
      }
    }
  }

  return { missingImports };
}

/**
 * Resolve relative path from base directory
 */
function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir.split('/').filter(p => p);
  const relParts = relativePath.split('/').filter(p => p);

  for (const part of relParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  return parts.join('/');
}
