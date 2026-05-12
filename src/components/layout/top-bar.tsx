'use client';

interface TopBarProps {
  designName: string | null;
  onBack: () => void;
  tabs?: React.ReactNode;
}

export default function TopBar({ designName, onBack, tabs }: TopBarProps) {
  return (
    <header className="flex items-center px-4 bg-white border-b border-claude-gray-200 h-10 min-h-[40px]">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-claude-gray-600 hover:text-claude-gray-700 transition-colors flex-shrink-0"
      >
        <svg className="w-5 h-5 text-claude-coral" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h8M8 12l3-3M8 12l3 3" />
        </svg>
        <span className="text-sm font-medium">
          {designName || 'React Components'}
        </span>
      </button>
      {tabs && (
        <div className="flex items-center ml-6 h-full">
          {tabs}
        </div>
      )}
    </header>
  );
}
