import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { glob } from 'glob';
import {
  DESIGNS_BASE_PATH,
  SHARED_NODE_MODULES,
  MAX_DESIGNS,
  METADATA_FILE,
  DESIGN_SRC_DIR,
  MAX_FILE_SIZE,
  MAX_FILES_PER_DESIGN,
} from './design-constants';
import {
  getIndexHtml,
  getPackageJson,
  getViteConfig,
  getTsConfig,
  getPostCssConfig,
  getTailwindConfig,
  getMainTsx,
  getIndexCss,
  getDefaultAppTsx,
  getNpmrc,
} from './vite-project-template';
import {
  getPackageJson as getNextPackageJson,
  getNextConfig,
  getTsConfig as getNextTsConfig,
  getTailwindConfig as getNextTailwindConfig,
  getPostCssConfig as getNextPostCssConfig,
  getPrismaSchema,
  getRootLayout,
  getDefaultPage,
  getGlobalsCss,
  getPrismaClient,
} from './next-project-template';
import { generateDockerCompose } from './export-templates';
import { validateAndFixCSS, fixNextConfigImages } from './css-validator';
import { validateSyntax, isTruncated } from './syntax-validator';
import type { DesignMetadata, DesignSummary, DesignDetail, DesignChatMessage } from '@/types/design';

class DesignService {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(process.cwd(), DESIGNS_BASE_PATH);
  }

  /**
   * Validate path is within design src/ directory and no traversal
   */
  private validateDesignPath(id: string, relativePath: string): boolean {
    if (!relativePath.startsWith('src/')) return false;
    const resolved = path.resolve(this.basePath, id, relativePath);
    const designRoot = path.resolve(this.basePath, id);
    return resolved.startsWith(designRoot) && !relativePath.includes('..');
  }

  /**
   * Get absolute path to design folder
   */
  getDesignPath(id: string): string {
    return path.join(this.basePath, id);
  }

  /**
   * Create node_modules symlink to shared dependencies
   */
  private async createNodeModulesSymlink(designPath: string): Promise<void> {
    const target = path.resolve(SHARED_NODE_MODULES);
    const link = path.join(designPath, 'node_modules');

    try {
      // Check if symlink already exists
      const stats = await fs.lstat(link);
      if (stats.isSymbolicLink()) {
        return; // Already exists
      }
    } catch {
      // Doesn't exist, create it
    }

    // Use relative path for portability
    const relativeTarget = path.relative(designPath, target);
    await fs.symlink(relativeTarget, link, 'dir');
  }

  /**
   * Add dependency to metadata tracking
   */
  async addDependency(id: string, packageName: string): Promise<void> {
    const designPath = this.getDesignPath(id);
    const metadataPath = path.join(designPath, METADATA_FILE);

    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);

    if (!metadata.dependencies.includes(packageName)) {
      metadata.dependencies.push(packageName);
      metadata.updatedAt = new Date().toISOString();

      // Atomic write
      const tempPath = `${metadataPath}.tmp`;
      try {
        await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2));
        await fs.rename(tempPath, metadataPath);
      } catch (error) {
        await fs.rm(tempPath, { force: true });
        throw error;
      }
    }
  }

  /**
   * Remove dependency from metadata tracking
   */
  async removeDependency(id: string, packageName: string): Promise<void> {
    const designPath = this.getDesignPath(id);
    const metadataPath = path.join(designPath, METADATA_FILE);

    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);

    metadata.dependencies = metadata.dependencies.filter((dep) => dep !== packageName);
    metadata.updatedAt = new Date().toISOString();

    // Atomic write
    const tempPath = `${metadataPath}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2));
      await fs.rename(tempPath, metadataPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }

  /**
   * Scaffold complete Vite project structure
   */
  private async scaffoldViteProject(
    id: string,
    designPath: string,
    initialCode?: string
  ): Promise<void> {
    // Create directories
    await fs.mkdir(path.join(designPath, 'src', 'components'), { recursive: true });

    // Write all config files
    await Promise.all([
      fs.writeFile(path.join(designPath, '.npmrc'), getNpmrc()),
      fs.writeFile(path.join(designPath, 'index.html'), getIndexHtml()),
      fs.writeFile(path.join(designPath, 'package.json'), getPackageJson(id)),
      fs.writeFile(path.join(designPath, 'vite.config.ts'), getViteConfig()),
      fs.writeFile(path.join(designPath, 'tsconfig.json'), getTsConfig()),
      fs.writeFile(path.join(designPath, 'postcss.config.js'), getPostCssConfig()),
      fs.writeFile(path.join(designPath, 'tailwind.config.js'), getTailwindConfig()),
    ]);

    // Write source files
    const appCode = initialCode || getDefaultAppTsx();
    await Promise.all([
      fs.writeFile(path.join(designPath, 'src', 'main.tsx'), getMainTsx()),
      fs.writeFile(path.join(designPath, 'src', 'index.css'), getIndexCss()),
      fs.writeFile(path.join(designPath, 'src', 'App.tsx'), appCode),
    ]);

    // Create node_modules symlink
    await this.createNodeModulesSymlink(designPath);
  }

  /**
   * Scaffold complete Next.js project structure with Prisma and Docker Compose
   */
  private async scaffoldNextjsProject(
    id: string,
    designPath: string,
    initialCode?: string,
    port?: number
  ): Promise<void> {
    // Create directories
    await fs.mkdir(path.join(designPath, 'src', 'app'), { recursive: true });
    await fs.mkdir(path.join(designPath, 'src', 'lib'), { recursive: true });
    await fs.mkdir(path.join(designPath, 'prisma'), { recursive: true });

    // Write config files
    await Promise.all([
      fs.writeFile(path.join(designPath, 'package.json'), getNextPackageJson(id)),
      fs.writeFile(path.join(designPath, 'next.config.mjs'), getNextConfig()),
      fs.writeFile(path.join(designPath, 'tsconfig.json'), getNextTsConfig()),
      fs.writeFile(path.join(designPath, 'tailwind.config.ts'), getNextTailwindConfig()),
      fs.writeFile(path.join(designPath, 'postcss.config.js'), getNextPostCssConfig()),
      fs.writeFile(path.join(designPath, 'prisma', 'schema.prisma'), getPrismaSchema()),
      fs.writeFile(path.join(designPath, 'docker-compose.yml'), generateDockerCompose('dev', port, id)),
    ]);

    // Write source files
    const pageCode = initialCode || getDefaultPage(id);
    await Promise.all([
      fs.writeFile(path.join(designPath, 'src', 'app', 'layout.tsx'), getRootLayout()),
      fs.writeFile(path.join(designPath, 'src', 'app', 'page.tsx'), pageCode),
      fs.writeFile(path.join(designPath, 'src', 'app', 'globals.css'), getGlobalsCss()),
      fs.writeFile(path.join(designPath, 'src', 'lib', 'db.ts'), getPrismaClient()),
    ]);
  }

  /**
   * Create new design with full project structure (Vite or Next.js based on mode)
   */
  async createDesign(
    name: string,
    prompt: string,
    initialCode?: string,
    mode: 'static' | 'dynamic' = 'static',
    port?: number
  ): Promise<DesignMetadata> {
    // Check design count limit
    const existing = await this.listDesigns();
    if (existing.length >= MAX_DESIGNS) {
      throw new Error(`Maximum design count (${MAX_DESIGNS}) reached`);
    }

    const id = nanoid(12);
    const designPath = this.getDesignPath(id);
    const now = new Date().toISOString();

    // Create design folder
    await fs.mkdir(designPath, { recursive: true });

    try {
      // Scaffold project based on mode
      if (mode === 'static') {
        await this.scaffoldViteProject(id, designPath, initialCode);
      } else {
        await this.scaffoldNextjsProject(id, designPath, initialCode, port);
      }

      // Create metadata
      const metadata: DesignMetadata = {
        id,
        name,
        mode,
        createdAt: now,
        updatedAt: now,
        prompts: [prompt],
        dependencies: [],
        files:
          mode === 'static'
            ? ['src/App.tsx', 'src/main.tsx', 'src/index.css']
            : ['src/app/page.tsx', 'src/app/layout.tsx', 'src/app/globals.css', 'src/lib/db.ts'],
        chatHistory: [],
      };

      // Write metadata
      await fs.writeFile(
        path.join(designPath, METADATA_FILE),
        JSON.stringify(metadata, null, 2)
      );

      return metadata;
    } catch (error) {
      // Cleanup on failure
      await fs.rm(designPath, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * List all designs sorted by updatedAt desc
   */
  async listDesigns(): Promise<DesignSummary[]> {
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      const designs: DesignSummary[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === '_shared') continue;

        try {
          const metadataPath = path.join(this.basePath, entry.name, METADATA_FILE);
          const content = await fs.readFile(metadataPath, 'utf-8');
          const metadata: DesignMetadata = JSON.parse(content);

          designs.push({
            id: metadata.id,
            name: metadata.name,
            mode: metadata.mode ?? 'static', // Migration: legacy designs default to static
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
            promptCount: metadata.prompts.length,
          });
        } catch {
          // Skip corrupted/missing metadata
          continue;
        }
      }

      // Sort by updatedAt desc
      return designs.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get design metadata only (fast, no file reads)
   */
  async getDesignMetadata(id: string): Promise<DesignMetadata> {
    const designPath = this.getDesignPath(id);
    const metadataPath = path.join(designPath, METADATA_FILE);
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);

    // Migrate legacy designs
    if (!metadata.chatHistory) metadata.chatHistory = [];
    if (!metadata.mode) metadata.mode = 'static';

    return metadata;
  }

  /**
   * Get design with all file contents
   */
  async getDesign(id: string): Promise<DesignDetail> {
    const designPath = this.getDesignPath(id);

    // Read metadata
    const metadataPath = path.join(designPath, METADATA_FILE);
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);
    // Migrate legacy designs that predate chatHistory field
    if (!metadata.chatHistory) metadata.chatHistory = [];
    // Migrate legacy designs that predate mode field
    if (!metadata.mode) metadata.mode = 'static';

    // Find all source files
    const srcPath = path.join(designPath, DESIGN_SRC_DIR);
    const pattern = path.join(srcPath, '**', '*.{tsx,ts,jsx,js,css}');
    const files = await glob(pattern, { nodir: true });

    // Read file contents
    const fileContents: Record<string, string> = {};
    for (const file of files) {
      const relativePath = path.relative(designPath, file);
      const content = await fs.readFile(file, 'utf-8');
      fileContents[relativePath] = content;
    }

    return {
      ...metadata,
      fileContents,
    };
  }

  /**
   * Update a file in the design (atomic write)
   */
  async updateFile(id: string, relativePath: string, content: string): Promise<void> {
    // Validate path
    if (!this.validateDesignPath(id, relativePath)) {
      throw new Error('Invalid file path: must be within src/ directory');
    }

    // Auto-fix CSS files
    let finalContent = content;
    if (relativePath.endsWith('.css') && relativePath.includes('globals')) {
      const validation = validateAndFixCSS(content);
      if (!validation.valid && validation.fixed) {
        console.log(`[DesignService] Auto-fixed CSS issues in ${relativePath}:`, validation.errors);
        finalContent = validation.fixed;
      }
    }

    // Auto-fix next.config.mjs to allow external images
    if (relativePath === 'next.config.mjs') {
      const fixedConfig = fixNextConfigImages(content);
      if (fixedConfig !== content) {
        console.log(`[DesignService] Auto-added image domains to ${relativePath}`);
        finalContent = fixedConfig;
      }
    }

    // Validate TypeScript/JavaScript syntax
    if (relativePath.match(/\.(tsx?|jsx?)$/)) {
      const syntaxValidation = validateSyntax(finalContent, relativePath);
      if (!syntaxValidation.valid) {
        console.error(`[DesignService] Syntax errors in ${relativePath}:`, syntaxValidation.errors);

        if (syntaxValidation.isIncomplete || isTruncated(finalContent)) {
          console.warn(`[DesignService] File ${relativePath} appears truncated — saving for continuation`);
        } else {
          console.warn(`[DesignService] Warning: ${relativePath} has syntax issues but will be saved`);
        }
      }
    }

    // Validate file size
    const contentSize = Buffer.byteLength(finalContent, 'utf-8');
    if (contentSize > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum (${MAX_FILE_SIZE} bytes)`);
    }

    const designPath = this.getDesignPath(id);
    const filePath = path.join(designPath, relativePath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Atomic write: write to temp, then rename
    const tempPath = `${filePath}.tmp`;
    try {
      await fs.writeFile(tempPath, finalContent, 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Cleanup temp file on failure
      await fs.rm(tempPath, { force: true });
      throw error;
    }

    // Update metadata
    const metadataPath = path.join(designPath, METADATA_FILE);
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);

    metadata.updatedAt = new Date().toISOString();
    if (!metadata.files.includes(relativePath)) {
      metadata.files.push(relativePath);

      // Validate file count
      if (metadata.files.length > MAX_FILES_PER_DESIGN) {
        throw new Error(`Maximum file count (${MAX_FILES_PER_DESIGN}) exceeded`);
      }
    }

    // Atomic metadata write
    const tempMetadataPath = `${metadataPath}.tmp`;
    try {
      await fs.writeFile(tempMetadataPath, JSON.stringify(metadata, null, 2));
      await fs.rename(tempMetadataPath, metadataPath);
    } catch (error) {
      await fs.rm(tempMetadataPath, { force: true });
      throw error;
    }
  }

  async deleteFile(id: string, relativePath: string): Promise<void> {
    if (!this.validateDesignPath(id, relativePath)) {
      throw new Error('Invalid file path: must be within src/ directory');
    }

    const designPath = this.getDesignPath(id);
    const filePath = path.join(designPath, relativePath);

    await fs.rm(filePath, { force: true });

    // Update metadata to remove from file list
    const metadataPath = path.join(designPath, METADATA_FILE);
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);

    metadata.files = metadata.files.filter(f => f !== relativePath);
    metadata.updatedAt = new Date().toISOString();

    const tempMetadataPath = `${metadataPath}.tmp`;
    try {
      await fs.writeFile(tempMetadataPath, JSON.stringify(metadata, null, 2));
      await fs.rename(tempMetadataPath, metadataPath);
    } catch (error) {
      await fs.rm(tempMetadataPath, { force: true });
      throw error;
    }
  }

  /**
   * Append models to prisma/schema.prisma (dynamic mode only)
   */
  async updatePrismaSchema(id: string, models: string): Promise<void> {
    const schemaPath = path.join(this.getDesignPath(id), 'prisma', 'schema.prisma');
    const baseSchema = `generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

${models}
`;
    const tempPath = `${schemaPath}.tmp`;
    try {
      await fs.writeFile(tempPath, baseSchema, 'utf-8');
      await fs.rename(tempPath, schemaPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }

    // Regenerate Prisma client inside the running container so the new models
    // are available before Next.js HMR reloads code that imports @prisma/client
    try {
      const { dockerDesignManager } = await import('./docker-design-manager');
      await dockerDesignManager.regeneratePrisma(id);
    } catch (error) {
      console.error(`[DesignService] Prisma regen failed for ${id}:`, error);
    }
  }

  /**
   * Delete design folder (and Docker stack if dynamic mode)
   */
  async deleteDesign(id: string): Promise<void> {
    // Check if this is a dynamic design and cleanup Docker resources
    try {
      const metadataPath = path.join(this.getDesignPath(id), METADATA_FILE);
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: DesignMetadata = JSON.parse(metadataContent);

      if (metadata.mode === 'dynamic') {
        // Dynamic import to avoid circular dependency
        const { dockerDesignManager } = await import('./docker-design-manager');
        await dockerDesignManager.destroyStack(id);
      }
    } catch (error) {
      // If metadata read fails, continue with deletion anyway
      console.error(`[DesignService] Error checking design mode for ${id}:`, error);
    }

    const designPath = this.getDesignPath(id);
    await fs.rm(designPath, { recursive: true, force: true });
  }

  /**
   * Add prompt to design history
   */
  async addPrompt(id: string, prompt: string): Promise<void> {
    const designPath = this.getDesignPath(id);
    const metadataPath = path.join(designPath, METADATA_FILE);

    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);

    metadata.prompts.push(prompt);
    metadata.updatedAt = new Date().toISOString();

    // Atomic write
    const tempPath = `${metadataPath}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2));
      await fs.rename(tempPath, metadataPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }

  /**
   * Append a chat message to the design's persistent chat history
   */
  async appendChatMessage(id: string, message: DesignChatMessage): Promise<void> {
    const designPath = this.getDesignPath(id);
    const metadataPath = path.join(designPath, METADATA_FILE);

    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);

    if (!metadata.chatHistory) metadata.chatHistory = [];
    metadata.chatHistory.push(message);

    const tempPath = `${metadataPath}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2));
      await fs.rename(tempPath, metadataPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }

  /**
   * Update design metadata
   */
  async updateMetadata(
    id: string,
    updates: Partial<Omit<DesignMetadata, 'id' | 'createdAt'>>
  ): Promise<void> {
    const designPath = this.getDesignPath(id);
    const metadataPath = path.join(designPath, METADATA_FILE);

    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: DesignMetadata = JSON.parse(metadataContent);

    // Whitelist allowed fields — never trust Object.assign with client input
    if (typeof updates.name === 'string') metadata.name = updates.name;
    metadata.updatedAt = new Date().toISOString();

    // Atomic write
    const tempPath = `${metadataPath}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2));
      await fs.rename(tempPath, metadataPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }
}

// Singleton instance
export const designService = new DesignService();
