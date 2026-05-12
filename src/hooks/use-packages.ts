'use client';

import { useState, useCallback, useEffect } from 'react';
import type { PackageInfo } from '@/types';

interface UsePackagesReturn {
  packages: PackageInfo[];
  isInstalling: boolean;
  installError: string | null;
  install: (name: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
  loadPackages: () => Promise<void>;
}

export function usePackages(designId: string | null): UsePackagesReturn {
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const loadPackages = useCallback(async () => {
    if (!designId) {
      setPackages([]);
      return;
    }

    try {
      const response = await fetch(`/api/designs/${designId}/packages`);
      if (!response.ok) throw new Error('Failed to load packages');
      const data = await response.json();
      setPackages(data.packages || []);
    } catch (error) {
      console.error('Failed to load packages:', error);
    }
  }, [designId]);

  const install = useCallback(async (name: string) => {
    if (!designId) return;

    setIsInstalling(true);
    setInstallError(null);

    try {
      const response = await fetch(`/api/designs/${designId}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Installation failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Installation failed');
      }

      // Reload package list
      await loadPackages();

      // Trigger iframe reload to pick up new dependencies
      // The parent component should handle this via key prop change

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setInstallError(message);
      throw error;
    } finally {
      setIsInstalling(false);
    }
  }, [designId, loadPackages]);

  const remove = useCallback(async (name: string) => {
    if (!designId) return;

    try {
      const response = await fetch(`/api/designs/${designId}/packages/${name}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to remove package');

      // Reload package list
      await loadPackages();
    } catch (error) {
      console.error('Failed to remove package:', error);
      throw error;
    }
  }, [designId, loadPackages]);

  // Load packages when designId changes
  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  return {
    packages,
    isInstalling,
    installError,
    install,
    remove,
    loadPackages,
  };
}
