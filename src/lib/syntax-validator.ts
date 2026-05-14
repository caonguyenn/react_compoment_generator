/**
 * Syntax validation utilities
 * Validates TypeScript/JavaScript syntax before writing files
 */

import ts from 'typescript';

interface SyntaxValidationResult {
  valid: boolean;
  errors: string[];
  isIncomplete?: boolean;
}

/**
 * Validate TypeScript/JavaScript syntax
 */
export function validateSyntax(content: string, filePath: string): SyntaxValidationResult {
  const errors: string[] = [];
  let isIncomplete = false;

  // TypeScript AST parsing (primary validation)
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  // Check for TypeScript parse errors
  if (sourceFile.parseDiagnostics && sourceFile.parseDiagnostics.length > 0) {
    for (const diagnostic of sourceFile.parseDiagnostics) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      errors.push(message);

      // Check if it's an EOF/incomplete error
      if (message.includes('expected') || message.includes('Unexpected end of file') || message.includes('Unterminated')) {
        isIncomplete = true;
      }
    }

    // If TypeScript parser found errors, check if they indicate real truncation
    if (isIncomplete) {
      return { valid: false, errors, isIncomplete };
    }

    // If TypeScript errors but not clearly incomplete, run structure check
    const structureCheck = checkStructure(content);
    if (structureCheck.isIncomplete) {
      return { valid: false, errors: [...errors, ...structureCheck.errors], isIncomplete: true };
    }

    // TypeScript errors but structure seems complete - might be type errors, allow it
    return { valid: true, errors: [] };
  }

  // TypeScript parsing succeeded - file is valid
  return { valid: true, errors: [] };
}

/**
 * Quick structural validation without full parsing
 */
function checkStructure(content: string): { valid: boolean; errors: string[]; isIncomplete?: boolean } {
  const errors: string[] = [];
  let isIncomplete = false;

  // Check for balanced braces
  const braceBalance = checkBraceBalance(content);
  if (braceBalance !== 0) {
    errors.push(`Unbalanced braces: ${braceBalance > 0 ? 'missing closing' : 'extra closing'} brace(s)`);
    isIncomplete = true;
  }

  // Check for balanced brackets
  const bracketBalance = checkBracketBalance(content);
  if (bracketBalance !== 0) {
    errors.push(`Unbalanced brackets: ${bracketBalance > 0 ? 'missing closing' : 'extra closing'} bracket(s)`);
    isIncomplete = true;
  }

  // Check for balanced parentheses
  const parenBalance = checkParenBalance(content);
  if (parenBalance !== 0) {
    errors.push(`Unbalanced parentheses: ${parenBalance > 0 ? 'missing closing' : 'extra closing'} paren(s)`);
    isIncomplete = true;
  }

  // Check for unterminated strings (basic check)
  const stringCheck = checkUnterminatedStrings(content);
  if (!stringCheck.valid) {
    errors.push('Unterminated string literal detected');
    isIncomplete = true;
  }

  // Check for incomplete JSX tags
  const jsxCheck = checkJSXBalance(content);
  if (!jsxCheck.valid) {
    errors.push('Unbalanced JSX tags detected');
    isIncomplete = true;
  }

  if (errors.length > 0) {
    return { valid: false, errors, isIncomplete };
  }

  return { valid: true, errors: [] };
}

function checkBraceBalance(content: string): number {
  let balance = 0;
  let inString = false;
  let inComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    // Handle comments
    if (!inString && char === '/' && next === '/') {
      // Skip to end of line
      i = content.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (!inString && char === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (inComment && char === '*' && next === '/') {
      inComment = false;
      i++;
      continue;
    }
    if (inComment) continue;

    // Handle strings
    if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    // Count braces
    if (char === '{') balance++;
    if (char === '}') balance--;
  }

  return balance;
}

function checkBracketBalance(content: string): number {
  let balance = 0;
  let inString = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '[') balance++;
    if (char === ']') balance--;
  }

  return balance;
}

function checkParenBalance(content: string): number {
  let balance = 0;
  let inString = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '(') balance++;
    if (char === ')') balance--;
  }

  return balance;
}

function checkUnterminatedStrings(content: string): { valid: boolean } {
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let inTemplate = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prev = content[i - 1];

    // Check for escaped quotes
    if (prev === '\\') continue;

    if (char === '"' && !inSingleQuote && !inTemplate) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote && !inTemplate) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '`' && !inDoubleQuote && !inSingleQuote) {
      inTemplate = !inTemplate;
    }

    // New line in non-template string is an error
    if ((inDoubleQuote || inSingleQuote) && char === '\n') {
      return { valid: false };
    }
  }

  // Check if any strings are still open
  if (inDoubleQuote || inSingleQuote || inTemplate) {
    return { valid: false };
  }

  return { valid: true };
}

function checkJSXBalance(content: string): { valid: boolean } {
  // Simple JSX tag balance check - only for obvious truncation
  // Match opening tags: <ComponentName ...> (not self-closing)
  const openTags = Array.from(content.matchAll(/<([A-Z][a-zA-Z0-9]*)[^/>]*[^/]>/g));
  const closeTags = Array.from(content.matchAll(/<\/([A-Z][a-zA-Z0-9]*)>/g));

  const openCount = openTags.length;
  const closeCount = closeTags.length;

  // Allow generous imbalance - only flag if severely unbalanced
  // This catches obvious truncation but allows fragments, nested components, etc.
  const diff = Math.abs(openCount - closeCount);

  // Only flag as invalid if difference is > 3 tags (likely truncation)
  return { valid: diff <= 3 };
}

/**
 * Check if file content appears to be truncated
 */
export function isTruncated(content: string): boolean {
  // Check for incomplete structures
  const validation = checkStructure(content);
  if (!validation.valid && validation.isIncomplete) {
    return true;
  }

  // Check for common truncation indicators
  const lastLine = content.trim().split('\n').pop() || '';

  // Incomplete statements
  if (lastLine.match(/^(const|let|var|function|export|import)\s+\w+\s*[{=]?\s*$/)) {
    return true;
  }

  // Trailing comma without closing
  if (lastLine.endsWith(',') && checkBraceBalance(content) > 0) {
    return true;
  }

  return false;
}
