'use client';

import { useState, useCallback } from 'react';

interface CodeActionsProps {
  code: string;
}

export default function CodeActions({ code }: CodeActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border-b border-gray-700">
      <button
        onClick={handleCopy}
        disabled={!code}
        className="px-2 py-1 text-xs font-medium text-gray-300 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <span className="text-xs text-gray-500">
        {code ? `${code.split('\n').length} lines` : 'No code generated'}
      </span>
    </div>
  );
}
