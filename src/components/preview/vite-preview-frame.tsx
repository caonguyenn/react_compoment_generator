'use client';

import { useEffect, useRef } from 'react';

interface VitePreviewFrameProps {
  designId: string;
  previewUrl: string | null;
  status: 'idle' | 'starting' | 'ready' | 'error' | 'stopped';
  error: string | null;
  onRefresh?: () => void;
  onRetry?: () => void;
}

export default function VitePreviewFrame({
  designId,
  previewUrl,
  status,
  error,
  onRefresh,
  onRetry,
}: VitePreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update iframe src when URL changes
  useEffect(() => {
    if (iframeRef.current && previewUrl && status === 'ready') {
      iframeRef.current.src = previewUrl;
    }
  }, [previewUrl, status]);

  const handleRefresh = () => {
    if (iframeRef.current && previewUrl) {
      iframeRef.current.src = previewUrl;
    }
    onRefresh?.();
  };

  const handleRetry = () => {
    onRetry?.();
  };

  return (
    <div className="relative h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200">
        <button
          onClick={handleRefresh}
          disabled={status !== 'ready'}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
          title="Refresh preview"
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </span>
        </button>
        {status === 'ready' && previewUrl && (
          <span className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            Vite Preview
          </span>
        )}
        {status === 'starting' && (
          <span className="text-xs text-indigo-600 flex items-center gap-2 font-medium">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Starting server...
          </span>
        )}
        {error && (
          <span className="text-xs text-red-600 truncate" title={error}>
            {error}
          </span>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden bg-gray-50">
        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full bg-white text-gray-400 text-sm">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <p>Select a design to start preview</p>
          </div>
        )}

        {status === 'starting' && (
          <div className="flex items-center justify-center h-full bg-white">
            <div className="text-center">
              <svg className="animate-spin h-12 w-12 mx-auto mb-4 text-indigo-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div className="text-sm text-gray-700 font-medium mb-1">
                Starting Vite dev server...
              </div>
              <div className="text-xs text-gray-500">
                This may take a few seconds on first load
              </div>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-center h-full bg-white p-6">
            <div className="text-center max-w-md">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-base text-gray-900 font-semibold mb-3">
                Preview Error
              </div>
              <div className="text-xs text-red-700 mb-4 font-mono bg-red-50 p-4 rounded-lg border border-red-200 break-words text-left">
                {error || 'Failed to start preview server'}
              </div>
              <button
                onClick={handleRetry}
                className="px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 shadow-sm hover:shadow transition-all duration-150"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {status === 'ready' && previewUrl && (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            sandbox="allow-scripts allow-same-origin allow-forms"
            className="w-full h-full border-0 bg-white"
            title={`Vite Preview - ${designId}`}
          />
        )}

        {status === 'stopped' && (
          <div className="flex flex-col items-center justify-center h-full bg-white text-gray-400 text-sm">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            <p>Preview stopped</p>
          </div>
        )}
      </div>
    </div>
  );
}
