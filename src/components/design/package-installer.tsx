'use client';

import { useState } from 'react';
import type { PackageInfo } from '@/types';

interface PackageInstallerProps {
  packages: PackageInfo[];
  isInstalling: boolean;
  installError: string | null;
  onInstall: (name: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  disabled?: boolean;
}

export default function PackageInstaller({
  packages,
  isInstalling,
  installError,
  onInstall,
  onRemove,
  disabled = false,
}: PackageInstallerProps) {
  const [packageName, setPackageName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleInstall = async () => {
    if (!packageName.trim() || disabled) return;

    setLocalError(null);
    try {
      await onInstall(packageName.trim());
      setPackageName('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Installation failed');
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await onRemove(name);
    } catch (error) {
      console.error('Failed to remove package:', error);
    }
  };

  const basePackages = packages.filter((p) => p.isBase);
  const extraPackages = packages.filter((p) => !p.isBase);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Packages</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Install input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
          placeholder="package-name"
          disabled={disabled || isInstalling}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500 transition-all duration-150"
        />
        <button
          onClick={handleInstall}
          disabled={disabled || isInstalling || !packageName.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-150 shadow-sm hover:shadow"
        >
          {isInstalling ? 'Installing...' : 'Install'}
        </button>
      </div>

      {/* Error display */}
      {(installError || localError) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-800">{installError || localError}</p>
        </div>
      )}

      {/* Package lists */}
      {packages.length > 0 && (
        <div className="space-y-3">
          {basePackages.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2 px-1">Base packages</div>
              <div className="space-y-1.5">
                {basePackages.map((pkg) => (
                  <div
                    key={pkg.name}
                    className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs"
                  >
                    <span className="font-mono text-gray-700">{pkg.name}</span>
                    <span className="text-gray-500 text-[11px]">{pkg.version}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {extraPackages.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2 px-1">Extra packages</div>
              <div className="space-y-1.5">
                {extraPackages.map((pkg) => (
                  <div
                    key={pkg.name}
                    className="group flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs hover:border-gray-300 hover:shadow-sm transition-all duration-150"
                  >
                    <span className="font-mono text-gray-700">{pkg.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-[11px]">{pkg.version}</span>
                      <button
                        onClick={() => handleRemove(pkg.name)}
                        disabled={disabled}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-all duration-150 disabled:opacity-0"
                        title="Remove package"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!disabled && packages.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-4 px-1">
          No packages installed yet
        </div>
      )}
    </div>
  );
}
