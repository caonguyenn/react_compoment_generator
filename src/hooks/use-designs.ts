'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { DesignSummary, DesignDetail } from '@/types';

interface UseDesignsReturn {
  designs: DesignSummary[];
  activeDesign: DesignDetail | null;
  activeDesignId: string | null;
  isLoading: boolean;
  loadDesigns: () => Promise<void>;
  createDesign: (name: string, description?: string, mode?: 'static' | 'dynamic') => Promise<string>;
  selectDesign: (id: string) => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
  setActiveDesignId: (id: string | null) => void;
  currentFilePath: string;
  setCurrentFilePath: (path: string) => void;
}

export function useDesigns(): UseDesignsReturn {
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [activeDesign, setActiveDesign] = useState<DesignDetail | null>(null);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string>('src/App.tsx');
  const [isLoading, setIsLoading] = useState(false);

  // Debounce timer for file saves
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSavesRef = useRef<Map<string, string>>(new Map());

  const loadDesigns = useCallback(async () => {
    try {
      const response = await fetch('/api/designs');
      if (!response.ok) throw new Error('Failed to load designs');
      const data = await response.json();
      setDesigns(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load designs:', error);
      setDesigns([]);
    }
  }, []);

  const createDesign = useCallback(async (name: string, description?: string, mode: 'static' | 'dynamic' = 'static'): Promise<string> => {
    const response = await fetch('/api/designs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, prompt: description || '', mode }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to create design');
    }
    const data = await response.json();
    return data.id as string;
  }, []);

  const selectDesign = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/designs/${id}`);
      if (!response.ok) throw new Error('Failed to load design');
      const data = await response.json();
      setActiveDesign(data);
      setActiveDesignId(id);
      setCurrentFilePath('src/App.tsx');
    } catch (error) {
      console.error('Failed to select design:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteDesign = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/designs/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete design');

      // Remove from list
      setDesigns((prev) => prev.filter((d) => d.id !== id));

      // Clear active design if it was the one deleted
      if (activeDesignId === id) {
        setActiveDesign(null);
        setActiveDesignId(null);
      }
    } catch (error) {
      console.error('Failed to delete design:', error);
      throw error;
    }
  }, [activeDesignId]);

  const saveFile = useCallback(async (path: string, content: string) => {
    if (!activeDesignId) return;

    // Store pending save
    pendingSavesRef.current.set(path, content);

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Set new timer for 1000ms debounce
    saveTimerRef.current = setTimeout(async () => {
      const saves = Array.from(pendingSavesRef.current.entries());
      pendingSavesRef.current.clear();

      for (const [filePath, fileContent] of saves) {
        try {
          const response = await fetch(`/api/designs/${activeDesignId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, content: fileContent }),
          });
          if (!response.ok) {
            console.error(`Failed to save ${filePath}`);
          }
        } catch (error) {
          console.error(`Error saving ${filePath}:`, error);
        }
      }
    }, 1000);
  }, [activeDesignId]);

  // Load designs on mount
  useEffect(() => {
    loadDesigns();
  }, [loadDesigns]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return {
    designs,
    activeDesign,
    activeDesignId,
    isLoading,
    loadDesigns,
    createDesign,
    selectDesign,
    deleteDesign,
    saveFile,
    setActiveDesignId,
    currentFilePath,
    setCurrentFilePath,
  };
}
