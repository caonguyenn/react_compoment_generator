'use client';

import { useState, useEffect, useRef } from 'react';

function buildPreviewHtml(code: string): string {
  // Transform code to work in browser environment
  let transformedCode = code
    // Remove import statements - React is available globally
    .replace(/import\s+(?:[\w{},\s*]*\s+from\s+)?['"]react['"];?\s*/gi, '')
    .replace(/import\s+(?:[\w{},\s*]*\s+from\s+)?['"]react\/.*['"];?\s*/gi, '')
    // Replace React imports with global reference
    .replace(/import\s+React\s*,?\s*\{([^}]+)\}\s+from\s+['"]react['"];?/gi, 'const { $1 } = React;')
    .replace(/import\s+\{([^}]+)\}\s+from\s+['"]react['"];?/gi, 'const { $1 } = React;')
    // Strip TypeScript type annotations
    .replace(/:\s*React\.\w+(<[^>]+>)?/g, '') // e.g., : React.FormEvent, : React.MouseEvent<HTMLButtonElement>
    .replace(/:\s*\w+(\[\])?(?=\s*[,;=)\]])/g, '') // e.g., : string, : number, : boolean[]
    .replace(/<\w+>/g, '') // Generic types like useState<string>
    .replace(/as\s+\w+/g, '') // Type assertions
    // Transform export default to module.exports
    .replace(/export\s+default\s+function\s+(\w+)/g, 'const $1 = function')
    .replace(/export\s+default\s+/g, 'module.exports.default = ');

  // If there's a named function, add it to module.exports
  const functionMatch = transformedCode.match(/const\s+(\w+)\s*=\s*function/);
  if (functionMatch && !transformedCode.includes('module.exports')) {
    transformedCode += `\nmodule.exports.default = ${functionMatch[1]};`;
  }

  // Escape code for safe injection into a template literal inside a <script> block.
  // \x3C encodes '<' to prevent </script> from breaking out of the script tag context.
  const escapedCode = transformedCode
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/</g, '\\x3C');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #f9fafb; }
    #root { min-height: calc(100vh - 48px); display: flex; align-items: center; justify-content: center; }
    .error-display { color: #dc2626; padding: 16px; background: #fee; border: 1px solid #fcc; border-radius: 4px; font-family: monospace; font-size: 13px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    const { React, ReactDOM, Babel } = window;
    try {
      // Define module/exports for the component
      const module = { exports: {} };
      const exports = module.exports;

      // Transform JSX to JavaScript using Babel
      const sourceCode = \`${escapedCode}\`;
      const transformed = Babel.transform(sourceCode, {
        presets: ['react'],
        filename: 'component.jsx'
      }).code;

      // Execute the transformed code
      eval(transformed);

      // Get the component (default export or named)
      const Component = module.exports.default || module.exports;

      if (!Component || typeof Component !== 'function') {
        throw new Error('No valid React component found. Make sure to export default a function component.');
      }

      // Render the component
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(Component));
    } catch (err) {
      console.error('Preview error:', err);
      const errorMessage = err.message || 'Unknown error';
      const errorDetails = err.stack ? '<br/><br/><small>' + err.stack.split('\\n').slice(0, 5).join('<br/>') + '</small>' : '';
      document.getElementById('root').innerHTML =
        '<div class="error-display">' +
        '<strong>Preview Error:</strong><br/>' +
        errorMessage +
        errorDetails +
        '<br/><br/><em>Tip: Try regenerating the component or simplifying your request.</em>' +
        '</div>';
      window.parent.postMessage({
        type: 'preview-error',
        message: errorMessage.length > 200 ? errorMessage.substring(0, 200) + '...' : errorMessage
      }, '*');
    }
  </script>
</body>
</html>`;
}

export function usePreview(code: string) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!code.trim()) {
      setHtml('');
      setError(null);
      return;
    }

    // Debounce 500ms
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      try {
        const previewHtml = buildPreviewHtml(code);
        setHtml(previewHtml);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to build preview');
      }
    }, 500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [code]);

  // Listen for errors from iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'preview-error') {
        setError(event.data.message);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const refresh = () => {
    if (code.trim()) {
      setHtml(buildPreviewHtml(code));
      setError(null);
    }
  };

  return { html, error, refresh };
}
