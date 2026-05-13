/**
 * Parse structured multi-file responses from AI generation
 */

export interface ParsedGenerateResponse {
  files: Array<{ path: string; content: string }>;
  dependencies: string[];
  explanation: string;
  prismaModels?: string; // Dynamic mode only
}

/**
 * Parse structured response with ---FILES---, ---DEPENDENCIES---, ---EXPLANATION--- sections
 * For dynamic mode, also parses ---SCHEMA--- section
 */
export function parseStructuredResponse(text: string, mode: 'static' | 'dynamic' = 'static'): ParsedGenerateResponse {
  // Try structured format first
  const filesMatch = text.match(/---FILES---\s*([\s\S]*?)(?:---SCHEMA---|---DEPENDENCIES---|---EXPLANATION---|$)/);
  const schemaMatch = text.match(/---SCHEMA---\s*([\s\S]*?)(?:---DEPENDENCIES---|---EXPLANATION---|$)/);
  const depsMatch = text.match(/---DEPENDENCIES---\s*([\s\S]*?)(?:---EXPLANATION---|$)/);
  const explanationMatch = text.match(/---EXPLANATION---\s*([\s\S]*?)$/);

  if (filesMatch) {
    // Parse structured format
    const filesSection = filesMatch[1].trim();
    const schemaSection = schemaMatch ? schemaMatch[1].trim() : '';
    const depsSection = depsMatch ? depsMatch[1].trim() : '';
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';

    const files = parseFilesSection(filesSection);
    const dependencies = parseDependenciesSection(depsSection);

    if (files.length === 0) {
      throw new Error('No files found in ---FILES--- section');
    }

    // Validate entry point based on mode
    const entryPoint = mode === 'static' ? 'src/App.tsx' : 'src/app/page.tsx';
    const hasEntry = files.some((f) => f.path === entryPoint);
    if (!hasEntry) {
      throw new Error(`Generated code must include ${entryPoint}`);
    }

    // Filter to valid paths only (skip invalid instead of throwing)
    const validFiles = files.filter((f) => isValidPath(f.path, mode));

    if (validFiles.length === 0) {
      throw new Error('No valid file paths found (must be within src/)');
    }

    const result: ParsedGenerateResponse = {
      files: validFiles,
      dependencies,
      explanation,
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
