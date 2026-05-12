import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { SHARED_PATH } from './design-constants';
import { designService } from './design-service';
import type { PackageInfo, InstallResult } from '@/types/design';

// Regex for npm version/range validation (semver + dist-tags + ranges)
const NPM_VERSION_REGEX = /^[a-zA-Z0-9._^~>=<|*\- ]+$/;

function runNpm(args: string[], cwd: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false, // never use shell — prevents injection
      timeout,
    });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString().slice(-500); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args[0]} exited with code ${code}: ${stderr}`));
    });
  });
}

// Regex for npm package name validation
const NPM_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

class PackageService {
  // Queue per design to prevent concurrent npm installs in same folder
  private installQueues = new Map<string, Promise<InstallResult>>();

  /**
   * Validate npm package name
   */
  private validatePackageName(name: string): boolean {
    return NPM_NAME_REGEX.test(name);
  }

  /**
   * Read package.json from a directory
   */
  private async readPackageJson(dir: string): Promise<Record<string, string>> {
    try {
      const pkgPath = path.join(dir, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return pkg.dependencies || {};
    } catch {
      return {};
    }
  }

  /**
   * List all packages available to a design (base + design-specific)
   */
  async listPackages(designId: string): Promise<PackageInfo[]> {
    const designPath = designService.getDesignPath(designId);

    // Read base packages from _shared
    const baseDeps = await this.readPackageJson(SHARED_PATH);

    // Read design-specific packages
    const designDeps = await this.readPackageJson(designPath);

    // Merge both with isBase flag
    const packages: PackageInfo[] = [];

    // Add base packages
    for (const [name, version] of Object.entries(baseDeps)) {
      packages.push({ name, version, isBase: true });
    }

    // Add design-specific packages (may override base)
    for (const [name, version] of Object.entries(designDeps)) {
      const existing = packages.find((p) => p.name === name);
      if (existing) {
        // Override base with design-specific
        existing.version = version;
        existing.isBase = false;
      } else {
        packages.push({ name, version, isBase: false });
      }
    }

    return packages.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Check if package is installed in base or design
   */
  async isInstalled(designId: string, packageName: string): Promise<boolean> {
    const packages = await this.listPackages(designId);
    return packages.some((p) => p.name === packageName);
  }

  /**
   * Check if package is in base packages (cannot be removed)
   */
  async isBasePackage(packageName: string): Promise<boolean> {
    const baseDeps = await this.readPackageJson(SHARED_PATH);
    return packageName in baseDeps;
  }

  /**
   * Internal install implementation
   */
  private async _doInstall(
    designId: string,
    name: string,
    version?: string
  ): Promise<InstallResult> {
    // Validate package name
    if (!this.validatePackageName(name)) {
      return {
        success: false,
        package: name,
        error: 'Invalid package name',
      };
    }

    // Validate version parameter to prevent injection
    if (version !== undefined && !NPM_VERSION_REGEX.test(version)) {
      return { success: false, package: name, error: 'Invalid package version' };
    }

    const designPath = designService.getDesignPath(designId);
    const spec = version ? `${name}@${version}` : name;
    const start = Date.now();

    try {
      // Check if already in base packages
      const isBase = await this.isBasePackage(name);
      if (isBase) {
        return {
          success: true,
          package: name,
          version: spec,
          duration: 0,
        };
      }

      // Check if already installed in design
      const isInstalled = await this.isInstalled(designId, name);
      if (isInstalled) {
        const designDeps = await this.readPackageJson(designPath);
        if (name in designDeps) {
          return {
            success: true,
            package: name,
            version: designDeps[name],
            duration: 0,
          };
        }
      }

      // Install package — shell:false + --ignore-scripts prevents injection and postinstall RCE
      await runNpm(['install', spec, '--save', '--legacy-peer-deps', '--ignore-scripts'], designPath, 60000);

      // Update metadata
      await designService.addDependency(designId, name);

      const duration = Date.now() - start;

      return {
        success: true,
        package: name,
        version: spec,
        duration,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Installation failed';
      return {
        success: false,
        package: name,
        error,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Install package (queued per design)
   */
  async installPackage(
    designId: string,
    name: string,
    version?: string
  ): Promise<InstallResult> {
    const key = designId;

    // Get previous task or create resolved promise
    const prev = this.installQueues.get(key) || Promise.resolve({} as InstallResult);

    // Chain new task after previous
    const task = prev
      .then(() => this._doInstall(designId, name, version))
      .catch(() => this._doInstall(designId, name, version)); // Retry on queue error

    // Update queue (catch errors to prevent queue blocking)
    this.installQueues.set(key, task.catch(() => ({} as InstallResult)));

    return task;
  }

  /**
   * Remove design-specific package
   */
  async removePackage(designId: string, name: string): Promise<InstallResult> {
    // Validate package name
    if (!this.validatePackageName(name)) {
      return {
        success: false,
        package: name,
        error: 'Invalid package name',
      };
    }

    // Check if it's a base package
    const isBase = await this.isBasePackage(name);
    if (isBase) {
      return {
        success: false,
        package: name,
        error: 'Cannot remove base package',
      };
    }

    const designPath = designService.getDesignPath(designId);
    const start = Date.now();

    try {
      // Check if package exists in design
      const designDeps = await this.readPackageJson(designPath);
      if (!(name in designDeps)) {
        return {
          success: false,
          package: name,
          error: 'Package not installed in this design',
        };
      }

      // Uninstall package — shell:false prevents injection
      await runNpm(['uninstall', name, '--save'], designPath, 30000);

      // Update metadata
      await designService.removeDependency(designId, name);

      return {
        success: true,
        package: name,
        duration: Date.now() - start,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Uninstall failed';
      return {
        success: false,
        package: name,
        error,
        duration: Date.now() - start,
      };
    }
  }
}

// Singleton instance
export const packageService = new PackageService();
