'use client';

export type RightTab = 'preview' | 'code' | 'build';

interface RightPanelProps {
  activeTab: RightTab;
  previewContent: React.ReactNode;
  codeContent: React.ReactNode;
  buildContent?: React.ReactNode;
}

export default function RightPanel({
  activeTab,
  previewContent,
  codeContent,
  buildContent,
}: RightPanelProps) {
  return (
    <main className="flex flex-col flex-1 overflow-hidden bg-claude-gray-50">
      {activeTab === 'preview' && previewContent}
      {activeTab === 'code' && codeContent}
      {activeTab === 'build' && buildContent}
    </main>
  );
}
