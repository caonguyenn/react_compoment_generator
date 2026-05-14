'use client';

import { useState, useCallback, KeyboardEvent, useRef, useEffect } from 'react';

interface PromptInputProps {
  onSubmit: (prompt: string, images?: string[]) => void;
  isLoading: boolean;
  onStop?: () => void;
}

export default function PromptInput({ onSubmit, isLoading, onStop }: PromptInputProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addImage = useCallback((dataUrl: string) => {
    setImages((prev) => [...prev, dataUrl]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && images.length === 0) || isLoading) return;
    onSubmit(trimmed, images.length > 0 ? images : undefined);
    setValue('');
    setImages([]);
  }, [value, images, isLoading, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith('image/'));
      if (imageItems.length === 0) return;
      e.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) addImage(dataUrl);
        };
        reader.readAsDataURL(file);
      });
    },
    [addImage]
  );

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  const canSubmit = (value.trim().length > 0 || images.length > 0) && !isLoading;

  return (
    <div className="rounded-2xl border border-claude-gray-200 bg-white shadow-sm focus-within:border-claude-coral/40 focus-within:shadow-md transition-all flex flex-col">
      {/* Image previews strip */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3 flex-shrink-0">
          {images.map((src, i) => (
            <div key={i} className="relative group flex-shrink-0">
              <img
                src={src}
                alt={`attachment ${i + 1}`}
                className="h-14 w-14 object-cover rounded-lg border border-claude-gray-200"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-claude-gray-600 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Textarea — grows up to 140px then scrolls */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="Describe what you want to create..."
        className="w-full px-3 pt-3 pb-1 text-sm text-claude-gray-700 placeholder-claude-gray-400 bg-transparent resize-none focus:outline-none overflow-y-auto flex-shrink-0"
        style={{ minHeight: '52px', maxHeight: '140px' }}
        rows={2}
        disabled={isLoading}
      />

      {/* Bottom toolbar — always rendered, never clipped */}
      <div className="flex items-center justify-between px-2 pb-2 pt-1 gap-2 flex-shrink-0">
        <button
          type="button"
          title="Paste image to attach"
          className="flex-shrink-0 p-1.5 text-claude-gray-400 hover:text-claude-gray-600 transition-colors"
          tabIndex={-1}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {isLoading ? (
          <button
            onClick={onStop}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap bg-claude-gray-100 text-claude-gray-700 hover:bg-claude-gray-200 shadow-sm"
            aria-label="Stop generation"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap ${
              canSubmit
                ? 'bg-claude-coral text-white hover:bg-claude-coral-dark shadow-sm'
                : 'bg-claude-gray-100 text-claude-gray-400 cursor-not-allowed'
            }`}
            aria-label="Send"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
            <span>Send</span>
          </button>
        )}
      </div>
    </div>
  );
}
