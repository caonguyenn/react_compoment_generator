'use client';

import { useState } from 'react';

interface BuildExportPanelProps {
  designId: string | null;
  disabled?: boolean;
}

export default function BuildExportPanel({ designId, disabled = false }: BuildExportPanelProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!designId || disabled) return;
    setIsDownloading(true);
    setError(null);
    try {
      const response = await fetch(`/api/designs/${designId}/export`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `design-${designId}-source.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download source code');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Export</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <button
        onClick={handleDownload}
        disabled={disabled || isDownloading || !designId}
        className="w-full px-4 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-300 rounded-lg hover:bg-indigo-100 hover:border-indigo-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-150"
      >
        <span className="flex items-center justify-center gap-2">
          {isDownloading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Downloading...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Source Code
            </>
          )}
        </span>
      </button>

      {!designId && (
        <p className="text-xs text-gray-500 text-center py-2">Select a design to download</p>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
