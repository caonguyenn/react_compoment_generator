'use client';

import { useState } from 'react';
import type { DesignSummary } from '@/types';

interface DesignListProps {
  designs: DesignSummary[];
  activeDesignId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onNewDesign: () => void;
}

const cardTints = [
  'bg-[#E8F4F0]',
  'bg-[#F5F1ED]',
  'bg-[#FAF0F0]',
  'bg-[#F0EDF7]',
  'bg-[#EDF7F0]',
  'bg-[#E8F2F7]',
];

export default function DesignList({
  designs,
  activeDesignId,
  onSelect,
  onDelete,
  onNewDesign,
}: DesignListProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete design:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* New Design Card */}
      <div
        onClick={onNewDesign}
        className="border border-dashed border-claude-gray-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-claude-coral hover:bg-claude-coral/5 transition-colors group"
      >
        <div className="w-10 h-10 rounded-full bg-claude-gray-100 group-hover:bg-claude-coral/10 flex items-center justify-center mb-3 transition-colors">
          <svg className="w-5 h-5 text-claude-gray-400 group-hover:text-claude-coral transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <span className="text-sm font-medium text-claude-gray-600 group-hover:text-claude-coral transition-colors">New Design</span>
      </div>

      {/* Design Grid */}
      {designs.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-claude-gray-400 uppercase tracking-wider">Recent</span>
            <span className="text-xs text-claude-gray-400">{designs.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {designs.map((design, index) => {
              const tint = cardTints[index % cardTints.length];
              const isActive = activeDesignId === design.id;

              return (
                <div
                  key={design.id}
                  onClick={() => onSelect(design.id)}
                  className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-150 ${
                    isActive
                      ? 'ring-2 ring-claude-coral shadow-md'
                      : 'border border-claude-gray-200 hover:shadow-md hover:border-claude-gray-300'
                  }`}
                >
                  {/* Thumbnail area */}
                  <div className={`${tint} h-20 flex items-center justify-center`}>
                    <svg className="w-8 h-8 text-claude-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  {/* Card info */}
                  <div className="px-3 py-2.5 bg-white">
                    <p className="text-xs font-medium text-claude-gray-700 truncate">{design.name}</p>
                    <p className="text-[10px] text-claude-gray-400 mt-0.5">
                      Your design · {new Date(design.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {/* Delete */}
                  <button
                    onClick={(e) => handleDelete(design.id, e)}
                    disabled={isDeleting}
                    className={`absolute top-1.5 right-1.5 p-1 rounded-md bg-white/80 backdrop-blur-sm text-claude-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ${
                      deleteConfirm === design.id ? 'opacity-100 text-red-500 bg-red-50' : ''
                    }`}
                    title={deleteConfirm === design.id ? 'Click again to confirm' : 'Delete'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
