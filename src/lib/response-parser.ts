/**
 * Parse structured multi-file responses from AI generation
 */

import { isTruncated } from './syntax-validator';

export interface ParsedGenerateResponse {
  files: Array<{ path: string; content: string }>;
  deletedFiles?: string[];
  dependencies: string[];
  explanation: string;
  prismaModels?: string; // Dynamic mode only
  hasIncompleteFiles?: boolean; // Warning flag for truncated files
  incompleteFiles?: string[]; // List of files that appear truncated
}

/**
 * Parse structured response with ---FILES---, ---DEPENDENCIES---, ---EXPLANATION--- sections
 * For dynamic mode, also parses ---SCHEMA--- section
 */
export function parseStructuredResponse(text: string, mode: 'static' | 'dynamic' = 'static', isContinuation: boolean = false): ParsedGenerateResponse {
  // Try structured format first
  const filesMatch = text.match(/---FILES---\s*([\s\S]*?)(?:---DELETED---|---SCHEMA---|---DEPENDENCIES---|---EXPLANATION---|$)/);
  const deletedMatch = text.match(/---DELETED---\s*([\s\S]*?)(?:---SCHEMA---|---DEPENDENCIES---|---EXPLANATION---|$)/);
  const schemaMatch = text.match(/---SCHEMA---\s*([\s\S]*?)(?:---DEPENDENCIES---|---EXPLANATION---|$)/);
  const depsMatch = text.match(/---DEPENDENCIES---\s*([\s\S]*?)(?:---EXPLANATION---|$)/);
  const explanationMatch = text.match(/---EXPLANATION---\s*([\s\S]*?)$/);

  if (filesMatch) {
    // Parse structured format
    const filesSection = filesMatch[1].trim();
    const deletedSection = deletedMatch ? deletedMatch[1].trim() : '';
    const schemaSection = schemaMatch ? schemaMatch[1].trim() : '';
    const depsSection = depsMatch ? depsMatch[1].trim() : '';
    let explanation = explanationMatch ? explanationMatch[1].trim() : '';

    const files = parseFilesSection(filesSection);
    const explicitDeps = parseDependenciesSection(depsSection);

    if (files.length === 0) {
      throw new Error('No files found in ---FILES--- section');
    }

    // Validate entry point based on mode (skip for continuation)
    if (!isContinuation) {
      const entryPoint = mode === 'static' ? 'src/App.tsx' : 'src/app/page.tsx';
      const hasEntry = files.some((f) => f.path === entryPoint);
      if (!hasEntry) {
        throw new Error(`Generated code must include ${entryPoint}`);
      }
    }

    // Filter to valid paths only (skip invalid instead of throwing)
    const validFiles = files.filter((f) => isValidPath(f.path, mode));

    if (validFiles.length === 0) {
      throw new Error('No valid file paths found (must be within src/)');
    }

    // Check for truncated files
    const incompleteFiles: string[] = [];
    for (const file of validFiles) {
      if (file.path.match(/\.(tsx?|jsx?)$/) && isTruncated(file.content)) {
        incompleteFiles.push(file.path);
        console.warn(`[Parser] File ${file.path} appears truncated`);
      }
    }

    // Fallback: extract summary from intro text if explanation missing (truncated response)
    if (!explanation) {
      const introMatch = text.match(/^(.+?)---FILES---/s);
      if (introMatch) {
        const intro = introMatch[1].trim();
        // Take first 2-3 sentences if available
        const sentences = intro.match(/[^.!?]+[.!?]+/g);
        explanation = sentences ? sentences.slice(0, 3).join(' ').trim() : intro.slice(0, 200);
      } else {
        explanation = `Generated ${mode} mode project with ${validFiles.length} files.`;
      }
    }

    // Merge explicit deps with auto-detected imports
    const implicitDeps = extractImplicitDependencies(validFiles, mode);
    const allDeps = new Set([...explicitDeps, ...implicitDeps]);
    const dependencies = Array.from(allDeps);

    if (implicitDeps.length > explicitDeps.length) {
      const added = implicitDeps.filter(d => !explicitDeps.includes(d));
      console.log(`[Parser] Auto-detected ${added.length} implicit dependencies:`, added);
    }

    // Parse deleted files
    const deletedFiles = deletedSection
      ? deletedSection.split('\n').map(l => l.trim()).filter(l => l && isValidPath(l, mode))
      : [];

    const result: ParsedGenerateResponse = {
      files: validFiles,
      deletedFiles: deletedFiles.length > 0 ? deletedFiles : undefined,
      dependencies,
      explanation,
      hasIncompleteFiles: incompleteFiles.length > 0,
      incompleteFiles: incompleteFiles.length > 0 ? incompleteFiles : undefined,
    };

    // Add Prisma models if dynamic mode (with validation)
    if (mode === 'dynamic' && schemaSection) {
      validatePrismaSchema(schemaSection);
      result.prismaModels = schemaSection;
    }

    return result;
  }

  // Fallback: try file markers without ---FILES--- header
  const entryPoint = mode === 'static' ? 'src/App.tsx' : 'src/app/page.tsx';
  const hasFileMarkers = text.includes(`===${entryPoint}===`);
  if (hasFileMarkers) {
    const files = parseFilesSection(text);
    const validFiles = files.filter((f) => isValidPath(f.path, mode));

    if (validFiles.length > 0 && validFiles.some((f) => f.path === entryPoint)) {
      return { files: validFiles, dependencies: [], explanation: '' };
    }
  }

  // Fallback: try legacy code fence format (wrap in App.tsx)
  const codeMatch = text.match(/```(?:tsx|jsx|typescript|javascript)?\s*([\s\S]*?)```/);
  if (codeMatch) {
    const code = codeMatch[1].trim();
    const lastFenceEnd = text.lastIndexOf('```');
    const explanation = lastFenceEnd !== -1 ? text.slice(lastFenceEnd + 3).trim() : '';

    return {
      files: [{ path: 'src/App.tsx', content: code }],
      dependencies: [],
      explanation,
    };
  }

  // Last resort: if response contains what looks like React/TSX code, wrap it
  if (text.includes('export default') && (text.includes('return (') || text.includes('return('))) {
    return {
      files: [{ path: 'src/App.tsx', content: text.trim() }],
      dependencies: [],
      explanation: '',
    };
  }

  throw new Error('Failed to parse AI response: no structured format or code fence found');
}

/**
 * Parse FILES section with ===path=== delimiters
 */
function parseFilesSection(filesSection: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];

  // Split by ===path=== markers
  const parts = filesSection.split(/===(.+?)===\n/);

  // parts[0] is empty or whitespace before first marker
  // parts[1] is first path, parts[2] is first content
  // parts[3] is second path, parts[4] is second content, etc.

  for (let i = 1; i < parts.length; i += 2) {
    const path = parts[i].trim();
    const content = parts[i + 1] ? parts[i + 1].trim() : '';

    if (path && content) {
      files.push({ path, content });
    }
  }

  return files;
}

/**
 * Parse DEPENDENCIES section (one package per line)
 */
function parseDependenciesSection(depsSection: string): string[] {
  if (!depsSection) return [];

  return depsSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')); // Filter empty and comments
}

/**
 * Validate file path (must be within src/, no traversal, no config files)
 */
function isValidPath(filePath: string, mode: 'static' | 'dynamic' = 'static'): boolean {
  // Must start with src/
  if (!filePath.startsWith('src/')) return false;

  // No path traversal
  if (filePath.includes('..')) return false;

  // No absolute paths
  if (filePath.startsWith('/')) return false;

  // Blacklist config files
  const blacklist = [
    'src/vite.config',
    'src/tsconfig',
    'src/package.json',
    'src/index.html',
  ];

  // Mode-specific blacklist
  if (mode === 'static') {
    blacklist.push('src/main.tsx'); // Vite: main.tsx is auto-generated
  }

  if (blacklist.some((banned) => filePath.startsWith(banned))) {
    return false;
  }

  return true;
}

/**
 * Validate Prisma schema - only allow model blocks, no generator/datasource
 */
function validatePrismaSchema(schema: string): void {
  // Block generator and datasource directives
  if (schema.includes('generator') || schema.includes('datasource')) {
    throw new Error('Prisma schema must not contain generator or datasource blocks');
  }

  // Block shell commands and suspicious syntax
  if (schema.includes('sh -c') || schema.includes('provider =') || schema.includes('curl') || schema.includes('wget')) {
    throw new Error('Prisma schema contains forbidden syntax');
  }

  // Validate only allowed keywords
  const lines = schema.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
  const allowedPattern = /^(model|enum|type)\s+\w+\s*\{/;
  const fieldPattern = /^\s+\w+/;
  const closingBrace = /^\s*\}/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!allowedPattern.test(trimmed) && !fieldPattern.test(trimmed) && !closingBrace.test(trimmed)) {
      throw new Error(`Invalid Prisma syntax: ${line}`);
    }
  }
}

/**
 * Built-in packages already in project templates (no install needed)
 */
const BUILTIN_PACKAGES: Record<string, Set<string>> = {
  static: new Set([
    'react', 'react-dom', 'react-router-dom',
    'tailwindcss', 'autoprefixer', 'postcss',
    'lucide-react', 'clsx', 'tailwind-merge',
  ]),
  dynamic: new Set([
    'next', 'react', 'react-dom',
    '@prisma/client', 'prisma',
    'tailwindcss', 'autoprefixer', 'postcss',
    'lucide-react', 'clsx', 'tailwind-merge',
    'typescript',
  ]),
};

/**
 * Extract external package names from import statements in generated files
 */
export function extractImplicitDependencies(
  files: Array<{ path: string; content: string }>,
  mode: 'static' | 'dynamic' = 'static'
): string[] {
  const builtins = BUILTIN_PACKAGES[mode];
  const detected = new Set<string>();

  // Match: import ... from 'package' / require('package')
  const importPattern = /(?:import\s+.*?\s+from\s+|import\s+|require\s*\(\s*)['"]([^./][^'"]*)['"]/g;

  for (const file of files) {
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(file.content)) !== null) {
      const specifier = match[1];
      // Skip local path aliases (@/ is a tsconfig path alias, not an npm package)
      if (specifier.startsWith('@/')) continue;
      // Extract package name: 'next-auth/react' → 'next-auth', '@scope/pkg/sub' → '@scope/pkg'
      const pkgName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];

      if (!builtins.has(pkgName)) {
        detected.add(pkgName);
      }
    }
  }

  return Array.from(detected);
}

/**
 * Extract component name from prompt for design naming
 */
export function extractNameFromPrompt(prompt: string): string {
  // Simple heuristic: take first 3-5 meaningful words
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2) // Skip short words like "a", "an", "the"
    .slice(0, 4);

  return words.join('-') || 'component';
}
