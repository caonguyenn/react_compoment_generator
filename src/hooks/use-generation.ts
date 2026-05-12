'use client';

import { useState, useCallback } from 'react';
import type { ChatMessage, GenerationResponse, FullGenerateResponse } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface GenerationState {
  code: string;
  explanation: string;
  isLoading: boolean;
  error: string | null;
  chatHistory: ChatMessage[];
}

async function persistMessage(designId: string, msg: ChatMessage): Promise<void> {
  try {
    await fetch(`/api/designs/${designId}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp).toISOString(),
        images: msg.images,
      }),
    });
  } catch {
    // Non-blocking — history loss on network error is acceptable
  }
}

export function useGeneration() {
  const [state, setState] = useState<GenerationState>({
    code: '',
    explanation: '',
    isLoading: false,
    error: null,
    chatHistory: [],
  });

  /** Load persisted chat history for a design */
  const loadHistory = useCallback(async (designId: string) => {
    try {
      const res = await fetch(`/api/designs/${designId}/history`);
      if (!res.ok) return;
      const messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
        images?: string[];
      }> = await res.json();

      setState((prev) => ({
        ...prev,
        chatHistory: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp).getTime(),
          images: m.images,
        })),
      }));
    } catch {
      // Silently ignore — history will just be empty
    }
  }, []);

  /** Clear history from state (called when navigating away from a design) */
  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, chatHistory: [], code: '', explanation: '' }));
  }, []);

  const generate = useCallback(async (prompt: string) => {
    const currentCode = state.code;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      chatHistory: [
        ...prev.chatHistory,
        { id: uuidv4(), role: 'user', content: prompt, timestamp: Date.now() },
      ],
    }));

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, currentCode: currentCode || undefined }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      const data: GenerationResponse = await response.json();

      setState((prev) => ({
        ...prev,
        code: data.code,
        explanation: data.explanation,
        isLoading: false,
        chatHistory: [
          ...prev.chatHistory,
          { id: uuidv4(), role: 'assistant', content: data.explanation, timestamp: Date.now() },
        ],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    }
  }, [state.code]);

  const generateFull = useCallback(async (
    prompt: string,
    designId?: string,
    images?: string[]
  ): Promise<string> => {
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      images,
    };

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      chatHistory: [...prev.chatHistory, userMsg],
    }));

    // Persist user message immediately
    if (designId) persistMessage(designId, userMsg);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode: 'full', designId, images }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      const data: FullGenerateResponse = await response.json();

      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: data.explanation || 'Component generated.',
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        isLoading: false,
        explanation: data.explanation,
        chatHistory: [...prev.chatHistory, assistantMsg],
      }));

      // Persist assistant message (use resolved designId from response)
      persistMessage(data.designId, assistantMsg);
      // Also ensure user message is persisted with correct designId for new designs
      if (!designId) persistMessage(data.designId, userMsg);

      return data.designId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err;
    }
  }, []);

  const setCode = useCallback((code: string) => {
    setState((prev) => ({ ...prev, code }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const reset = useCallback(() => {
    setState({ code: '', explanation: '', isLoading: false, error: null, chatHistory: [] });
  }, []);

  return { ...state, generate, generateFull, loadHistory, clearHistory, setCode, clearError, reset };
}
