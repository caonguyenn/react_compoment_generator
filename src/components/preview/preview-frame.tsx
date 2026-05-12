'use client';

import PreviewError from './preview-error';
import VitePreviewFrame from './vite-preview-frame';
import type { VitePreviewStatus } from '@/hooks/use-vite-preview';

interface PreviewFrameProps {
  designId?: string;
  html?: string;
  error?: string | null;
  onRefresh?: () => void;
  // Vite preview props — passed from parent's single useVitePreview instance
  previewUrl?: string | null;
  previewStatus?: VitePreviewStatus;
  previewError?: string | null;
  previewRefreshKey?: number;
  onPreviewRetry?: () => void;
}

export default function PreviewFrame({
  designId,
  html,
  error,
  onRefresh,
  previewUrl,
  previewStatus,
  previewError,
  previewRefreshKey,
  onPreviewRetry,
}: PreviewFrameProps) {
  // Vite preview mode (for saved designs with ID)
  if (designId) {
    return (
      <VitePreviewFrame
        key={previewRefreshKey}
        designId={designId}
        previewUrl={previewUrl ?? null}
        status={previewStatus ?? 'idle'}
        error={previewError ?? null}
        onRefresh={onRefresh}
        onRetry={onPreviewRetry}
      />
    );
  }

  // Inline preview mode (for unsaved/in-progress code)
  if (!html && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white text-gray-400 text-sm">
        <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <p>Generate a component to see the preview</p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col bg-white">
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-150"
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </span>
        </button>
        <span className="text-xs text-gray-500 font-medium">Inline Preview</span>
        {error && (
          <span className="text-xs text-red-600 truncate">{error}</span>
        )}
      </div>
      <div className="flex-1 relative overflow-hidden bg-gray-50">
        {error && <PreviewError message={error} />}
        <iframe
          srcDoc={html}
          sandbox="allow-scripts"
          className="w-full h-full border-0"
          title="Component Preview"
        />
      </div>
    </div>
  );
}
