'use client';

import React, { useState } from 'react';
import TopBar from '@/components/layout/top-bar';
import LeftPanel from '@/components/layout/left-panel';
import RightPanel, { type RightTab } from '@/components/layout/right-panel';
import PromptInput from '@/components/prompt/prompt-input';
import ChatHistory from '@/components/prompt/chat-history';
import CodeEditor from '@/components/editor/code-editor';
import PreviewFrame from '@/components/preview/preview-frame';
import FileTabs from '@/components/editor/file-tabs';
import DesignList from '@/components/design/design-list';
import BuildExportPanel from '@/components/design/build-export-panel';
import NewDesignModal from '@/components/design/new-design-modal';
import { useGeneration } from '@/hooks/use-generation';
import { usePreview } from '@/hooks/use-preview';
import { useDesigns } from '@/hooks/use-designs';
import { usePackages } from '@/hooks/use-packages';
import { useVitePreview } from '@/hooks/use-vite-preview';

export default function Home() {
  const [showNewDesignModal, setShowNewDesignModal] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('preview');
  const { code, isLoading, error, chatHistory, truncated, generateFull, continueGeneration, stopGeneration, loadHistory, clearHistory, setCode, clearError } = useGeneration();
  const { html, error: previewError, refresh } = usePreview(code);

  const {
    designs,
    activeDesign,
    activeDesignId,
    loadDesigns,
    createDesign,
    selectDesign,
    deleteDesign,
    saveFile,
    setActiveDesignId,
    currentFilePath,
    setCurrentFilePath,
  } = useDesigns();

  usePackages(activeDesignId);
  const vitePreview = useVitePreview(activeDesignId || undefined);

  const handleGenerateSubmit = async (prompt: string, images?: string[]) => {
    if (!activeDesignId) return;
    try {
      const designId = await generateFull(prompt, activeDesignId, images);
      await loadDesigns();
      // Restart BEFORE selectDesign so previewUrl is null when the re-render fires
      vitePreview.restartPreview(designId);
      await selectDesign(designId);
    } catch (err) {
      console.error('Generation failed:', err);
    }
  };

  const handleCreateNewDesign = async (name: string, description: string, mode: 'static' | 'dynamic' = 'static') => {
    try {
      const designId = await createDesign(name, description, mode);
      await loadDesigns();
      // Start BEFORE selectDesign so previewUrl is null when the re-render fires
      vitePreview.startPreview(designId);
      await selectDesign(designId);
      await loadHistory(designId);
      setShowNewDesignModal(false);
    } catch (err) {
      console.error('Design creation failed:', err);
    }
  };

  const handleDesignSelect = async (id: string) => {
    clearHistory();
    // Start BEFORE selectDesign so previewUrl is null when the re-render fires
    vitePreview.startPreview(id);
    await selectDesign(id);
    await loadHistory(id);
  };

  const handleBack = () => {
    clearHistory();
    setActiveDesignId(null);
  };

  React.useEffect(() => {
    loadDesigns();
  }, [loadDesigns]);

  const currentCode = activeDesign
    ? activeDesign.fileContents[currentFilePath] || ''
    : code;

  const handleCodeChange = (newCode: string) => {
    if (activeDesignId && activeDesign) {
      saveFile(currentFilePath, newCode);
      activeDesign.fileContents[currentFilePath] = newCode;
    } else {
      setCode(newCode);
    }
  };

  const availableFiles = activeDesign ? activeDesign.files : [];

  // HOME SCREEN: No active design — show design grid in main area
  if (!activeDesignId) {
    return (
      <div className="flex flex-col h-full bg-claude-gray-50">
        <TopBar designName={null} onBack={handleBack} />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-10">
            <DesignList
              designs={designs}
              activeDesignId={activeDesignId}
              onSelect={handleDesignSelect}
              onDelete={deleteDesign}
              onNewDesign={() => setShowNewDesignModal(true)}
            />
          </div>
        </div>

        {showNewDesignModal && (
          <NewDesignModal
            onClose={() => setShowNewDesignModal(false)}
            onCreate={handleCreateNewDesign}
          />
        )}
      </div>
    );
  }

  // DESIGN DETAIL: Active design — left chat, right preview/code/build
  const tabs = (
    <>
      {(['preview', 'code', 'build'] as RightTab[]).map((tab) => (
        <button
          key={tab}
          onClick={() => setRightTab(tab)}
          className={`px-3 h-full text-sm font-medium border-b-2 transition-colors capitalize ${
            rightTab === tab
              ? 'border-claude-coral text-claude-gray-700'
              : 'border-transparent text-claude-gray-400 hover:text-claude-gray-600'
          }`}
        >
          {tab}
        </button>
      ))}
    </>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      <TopBar designName={activeDesign?.name || null} onBack={handleBack} tabs={tabs} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat + prompt */}
        <LeftPanel
          bottomInput={<PromptInput onSubmit={handleGenerateSubmit} isLoading={isLoading} onStop={stopGeneration} />}
        >
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700">{error}</p>
                <button onClick={clearError} className="mt-1 text-xs text-red-500 hover:text-red-700">
                  Dismiss
                </button>
              </div>
            )}

            <ChatHistory
              messages={chatHistory}
              isLoading={isLoading}
              truncated={truncated}
              onContinue={activeDesignId ? () => continueGeneration(activeDesignId) : undefined}
            />

            {chatHistory.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-claude-coral/10 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-claude-coral" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-sm text-claude-gray-500">Describe what you want to create</p>
                <p className="text-xs text-claude-gray-400 mt-1">Type below to generate or refine</p>
              </div>
            )}
          </div>
        </LeftPanel>

        {/* Right: Preview / Code / Build */}
        <RightPanel
          activeTab={rightTab}
          previewContent={
            <PreviewFrame
              designId={activeDesignId || undefined}
              html={html}
              error={previewError}
              onRefresh={activeDesignId ? vitePreview.refreshPreview : refresh}
              previewUrl={vitePreview.previewUrl}
              previewStatus={vitePreview.status}
              previewError={vitePreview.error}
              previewRefreshKey={vitePreview.refreshKey}
              onPreviewRetry={activeDesignId ? () => vitePreview.startPreview(activeDesignId) : undefined}
            />
          }
          codeContent={
            currentCode || activeDesign ? (
              <div className="flex flex-col h-full">
                {activeDesign && availableFiles.length > 0 && (
                  <FileTabs
                    files={availableFiles}
                    activeFile={currentFilePath}
                    onFileSelect={setCurrentFilePath}
                  />
                )}
                <div className="flex-1">
                  <CodeEditor code={currentCode} onChange={handleCodeChange} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-claude-gray-400">
                <p className="text-sm">Generate a component to see code here</p>
              </div>
            )
          }
          buildContent={
            <div className="p-6">
              <BuildExportPanel designId={activeDesignId} />
            </div>
          }
        />
      </div>
    </div>
  );
}
