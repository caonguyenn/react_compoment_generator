'use client';

interface FileTabsProps {
  files: string[];
  activeFile: string;
  onFileSelect: (file: string) => void;
}

export default function FileTabs({
  files,
  activeFile,
  onFileSelect,
}: FileTabsProps) {
  if (files.length === 0) {
    return null;
  }

  // Sort files: App.tsx first, then alphabetically
  const sortedFiles = [...files].sort((a, b) => {
    if (a === 'src/App.tsx') return -1;
    if (b === 'src/App.tsx') return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto">
      {sortedFiles.map((file) => {
        const fileName = file.split('/').pop() || file;
        const isActive = file === activeFile;

        return (
          <button
            key={file}
            onClick={() => onFileSelect(file)}
            className={`
              px-3 py-2 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap
              ${
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }
            `}
          >
            {fileName}
          </button>
        );
      })}
    </div>
  );
}
