'use client';

import { useState, useCallback, useRef } from 'react';

export type VitePreviewStatus = 'idle' | 'starting' | 'ready' | 'error' | 'stopped';
type PreviewStatus = VitePreviewStatus;

interface VitePreviewState {
  previewUrl: string | null;
  status: PreviewStatus;
  error: string | null;
  port: number | null;
  refreshKey: number;
}

interface UseVitePreviewReturn extends VitePreviewState {
  startPreview: (designId: string) => Promise<void>;
  restartPreview: (designId: string) => Promise<void>;
  stopPreview: (designId: string) => Promise<void>;
  refreshPreview: () => void;
}

/**
 * Hook for managing Vite preview lifecycle
 * Handles server startup, status polling, and error states
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useVitePreview(_designId?: string): UseVitePreviewReturn {
  const [state, setState] = useState<VitePreviewState>({
    previewUrl: null,
    status: 'idle',
    error: null,
    port: null,
    refreshKey: 0,
  });

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const currentDesignId = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Poll server status until it's ready.
   * Aborts if currentDesignId changes (user switched designs).
   */
  const pollForReady = useCallback(async (id: string, attempts = 0): Promise<void> => {
    const maxAttempts = 20;
    const pollInterval = 500;

    // Stale check — bail if user switched to a different design
    if (currentDesignId.current !== id) return;

    if (attempts >= maxAttempts) {
      if (currentDesignId.current === id) {
        setState((prev) => ({
          ...prev,
          previewUrl: null,
          status: 'error',
          error: 'Preview server startup timeout',
          port: null,
        }));
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    // Stale check again after the delay
    if (currentDesignId.current !== id) return;

    try {
      const response = await fetch(`/api/designs/${id}/preview/status`);
      if (!response.ok) {
        throw new Error('Status check failed');
      }

      const data = await response.json();

      if (currentDesignId.current !== id) return;

      if (data.status === 'ready') {
        setState((prev) => ({
          ...prev,
          previewUrl: `${data.url}?t=${Date.now()}`,
          status: 'ready',
          error: null,
          port: data.port,
        }));
      } else if (data.status === 'error') {
        setState((prev) => ({
          ...prev,
          previewUrl: null,
          status: 'error',
          error: 'Server failed to start',
          port: null,
        }));
      } else if (data.status === 'starting') {
        await pollForReady(id, attempts + 1);
      }
    } catch (err) {
      console.error('[useVitePreview] Poll failed:', err);
      if (currentDesignId.current === id) {
        await pollForReady(id, attempts + 1);
      }
    }
  }, []);

  /**
   * Start the Vite preview server for a design
   */
  const startPreview = useCallback(async (id: string) => {
    // Abort any in-flight request for a previous design
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Update currentDesignId first so any in-flight polls for old design abort
    currentDesignId.current = id;
    // Reset state immediately — increment refreshKey to force iframe remount on next ready
    setState((prev) => ({
      previewUrl: null,
      status: 'starting',
      error: null,
      port: null,
      refreshKey: prev.refreshKey + 1,
    }));

    try {
      const response = await fetch(`/api/designs/${id}/preview/start`, {
        method: 'POST',
        signal: controller.signal,
      });

      // Stale check after fetch completes
      if (currentDesignId.current !== id) return;

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start preview server');
      }

      const contentType = response.headers.get('content-type');

      // Handle SSE stream for dynamic mode
      if (contentType?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const eventMatch = line.match(/^event: (.+)$/m);
            const dataMatch = line.match(/^data: (.+)$/m);

            if (eventMatch && dataMatch) {
              const event = eventMatch[1];
              const data = JSON.parse(dataMatch[1]);

              if (currentDesignId.current !== id) return;

              if (event === 'progress') {
                // Update status with progress message (optional: show in UI)
                console.log(`[useVitePreview] ${data.message}`);
              } else if (event === 'ready') {
                setState((prev) => ({
                  ...prev,
                  previewUrl: `${data.url}?t=${Date.now()}`,
                  status: 'ready',
                  error: null,
                  port: data.port,
                }));
              } else if (event === 'error') {
                setState((prev) => ({
                  ...prev,
                  previewUrl: null,
                  status: 'error',
                  error: data.message || 'Failed to start preview',
                  port: null,
                }));
              }
            }
          }
        }
      } else {
        // Handle JSON response for static mode
        const data = await response.json();

        if (currentDesignId.current !== id) return;

        setState((prev) => ({
          ...prev,
          previewUrl: data.status === 'ready' ? `${data.url}?t=${Date.now()}` : null,
          status: data.status === 'ready' ? 'ready' : 'starting',
          error: null,
          port: data.port,
        }));

        // If still starting, poll for ready status
        if (data.status === 'starting') {
          await pollForReady(id);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('[useVitePreview] Start failed:', err);
      if (currentDesignId.current === id) {
        setState((prev) => ({
          ...prev,
          previewUrl: null,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to start preview',
          port: null,
        }));
      }
    }
  }, [pollForReady]);

  /**
   * Stop then start — forces server restart so new generated files are served fresh.
   * Use this after generation to guarantee the latest code is loaded.
   */
  const restartPreview = useCallback(async (id: string) => {
    // Abort any in-flight request for a previous design
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    currentDesignId.current = id;
    setState((prev) => ({
      ...prev,
      previewUrl: null,
      status: 'starting',
      error: null,
      port: null,
      refreshKey: prev.refreshKey + 1,
    }));

    try {
      // Stop existing server first
      await fetch(`/api/designs/${id}/preview/stop`, { method: 'POST', signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Ignore other stop errors — server may already be down
    }

    if (currentDesignId.current !== id) return;

    // Start fresh
    try {
      const response = await fetch(`/api/designs/${id}/preview/start`, { method: 'POST', signal: controller.signal });

      if (currentDesignId.current !== id) return;

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start preview server');
      }

      const contentType = response.headers.get('content-type');

      // Handle SSE stream for dynamic mode
      if (contentType?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const eventMatch = line.match(/^event: (.+)$/m);
            const dataMatch = line.match(/^data: (.+)$/m);

            if (eventMatch && dataMatch) {
              const event = eventMatch[1];
              const data = JSON.parse(dataMatch[1]);

              if (currentDesignId.current !== id) return;

              if (event === 'progress') {
                console.log(`[useVitePreview] ${data.message}`);
              } else if (event === 'ready') {
                setState((prev) => ({
                  ...prev,
                  previewUrl: `${data.url}?t=${Date.now()}`,
                  status: 'ready',
                  error: null,
                  port: data.port,
                }));
              } else if (event === 'error') {
                setState((prev) => ({
                  ...prev,
                  previewUrl: null,
                  status: 'error',
                  error: data.message || 'Failed to restart preview',
                  port: null,
                }));
              }
            }
          }
        }
      } else {
        // Handle JSON response for static mode
        const data = await response.json();

        if (currentDesignId.current !== id) return;

        setState((prev) => ({
          ...prev,
          previewUrl: data.status === 'ready' ? `${data.url}?t=${Date.now()}` : null,
          status: data.status === 'ready' ? 'ready' : 'starting',
          error: null,
          port: data.port,
        }));

        if (data.status === 'starting') {
          await pollForReady(id);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (currentDesignId.current === id) {
        setState((prev) => ({
          ...prev,
          previewUrl: null,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to restart preview',
          port: null,
        }));
      }
    }
  }, [pollForReady]);

  /**
   * Stop the Vite preview server
   */
  const stopPreview = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/designs/${id}/preview/stop`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop preview server');
      }

      if (currentDesignId.current === id) {
        setState((prev) => ({
          ...prev,
          previewUrl: null,
          status: 'stopped',
          error: null,
          port: null,
        }));
        currentDesignId.current = null;
      }
    } catch (err) {
      console.error('[useVitePreview] Stop failed:', err);
      // Don't update error state for stop failures - server might already be down
    }
  }, []);

  /**
   * Refresh the preview by reloading the iframe
   */
  const refreshPreview = useCallback(() => {
    if (iframeRef.current && state.previewUrl) {
      iframeRef.current.src = state.previewUrl;
    }
  }, [state.previewUrl]);

  // No auto-start effect — callers invoke startPreview explicitly to avoid double-starts

  return {
    ...state,
    startPreview,
    restartPreview,
    stopPreview,
    refreshPreview,
  };
}
