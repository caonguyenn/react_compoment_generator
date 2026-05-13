'use client';

import { useState } from 'react';
import { Layers, Database } from 'lucide-react';

type DesignMode = 'static' | 'dynamic';

interface NewDesignModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string, mode: DesignMode) => Promise<void>;
}

export default function NewDesignModal({ onClose, onCreate }: NewDesignModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<DesignMode>('static');
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = name.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    try {
      await onCreate(name.trim(), description.trim(), mode);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleCreate();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-base font-semibold text-claude-gray-700">New project</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-claude-gray-400 hover:text-claude-gray-600 hover:bg-claude-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Fields */}
        <div className="px-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-claude-gray-500 mb-1.5">
              Project name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Dashboard UI"
              className="w-full px-3 py-2.5 text-sm border border-claude-gray-200 rounded-lg focus:outline-none focus:border-claude-coral transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-claude-gray-500 mb-1.5">
              Description <span className="text-claude-gray-300">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief notes about this project..."
              rows={3}
              className="w-full px-3 py-2.5 text-sm border border-claude-gray-200 rounded-lg focus:outline-none focus:border-claude-coral resize-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-claude-gray-500 mb-2">
              Project type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('static')}
                className={`flex flex-col items-start p-3 border-2 rounded-lg transition-all ${
                  mode === 'static'
                    ? 'border-claude-coral bg-claude-coral/5'
                    : 'border-claude-gray-200 hover:border-claude-gray-300'
                }`}
              >
                <div className={`p-1.5 rounded-md mb-2 ${
                  mode === 'static' ? 'bg-claude-coral text-white' : 'bg-claude-gray-100 text-claude-gray-600'
                }`}>
                  <Layers size={16} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-claude-gray-700">Static</div>
                  <div className="text-xs text-claude-gray-500 mt-0.5">React component, no database</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('dynamic')}
                className={`flex flex-col items-start p-3 border-2 rounded-lg transition-all ${
                  mode === 'dynamic'
                    ? 'border-claude-coral bg-claude-coral/5'
                    : 'border-claude-gray-200 hover:border-claude-gray-300'
                }`}
              >
                <div className={`p-1.5 rounded-md mb-2 ${
                  mode === 'dynamic' ? 'bg-claude-coral text-white' : 'bg-claude-gray-100 text-claude-gray-600'
                }`}>
                  <Database size={16} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-claude-gray-700">Dynamic</div>
                  <div className="text-xs text-claude-gray-500 mt-0.5">Next.js app + PostgreSQL</div>
                </div>
              </button>
            </div>
          </div>

          <p className="text-xs text-claude-gray-400">
            You&apos;ll describe what to build in the chat after the project is created.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-6 py-5">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2.5 text-sm font-medium text-claude-gray-600 bg-white border border-claude-gray-200 rounded-lg hover:bg-claude-gray-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || isCreating}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
              canCreate && !isCreating
                ? 'text-white bg-claude-coral border-claude-coral hover:bg-claude-coral-dark cursor-pointer'
                : 'text-claude-gray-400 bg-claude-gray-100 border-claude-gray-200 cursor-not-allowed'
            }`}
          >
            {isCreating ? 'Creating...' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  );
}
