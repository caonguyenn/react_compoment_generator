interface LeftPanelProps {
  children: React.ReactNode;
  bottomInput?: React.ReactNode;
}

export default function LeftPanel({ children, bottomInput }: LeftPanelProps) {
  return (
    <aside className="flex flex-col w-full md:w-[340px] min-w-[280px] border-r border-claude-gray-200 bg-white">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {children}
      </div>
      {bottomInput && (
        <div className="flex-shrink-0 border-t border-claude-gray-200 px-4 py-3 bg-white">
          {bottomInput}
        </div>
      )}
    </aside>
  );
}
