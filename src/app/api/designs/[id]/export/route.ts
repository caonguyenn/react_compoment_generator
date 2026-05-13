import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import JSZip from 'jszip';
import { designService } from '@/lib/design-service';
import { generateDockerCompose, generateDockerfile, generateReadme } from '@/lib/export-templates';

const DESIGN_ID_REGEX = /^[A-Za-z0-9_-]+$/;
const SKIP_ENTRIES = new Set(['node_modules', 'dist', 'metadata.json', '.vite']);

async function addDirectoryToZip(zip: JSZip, dirPath: string, zipPath: string = '') {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink() || SKIP_ENTRIES.has(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    const zipEntryPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, zipEntryPath);
    } else {
      const content = await fs.readFile(fullPath);
      zip.file(zipEntryPath, content);
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const designId = params.id;

    if (!DESIGN_ID_REGEX.test(designId)) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }

    const designPath = designService.getDesignPath(designId);

    try {
      await fs.access(designPath);
    } catch {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }

    const zip = new JSZip();
    await addDirectoryToZip(zip, designPath);

    // Get design metadata to check mode
    const metadata = await designService.getDesignMetadata(designId);

    // Add Docker deployment files for dynamic designs
    if (metadata.mode === 'dynamic') {
      zip.file('docker-compose.yml', generateDockerCompose());
      zip.file('Dockerfile', generateDockerfile());
      zip.file('README.md', generateReadme(metadata.name));
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return new NextResponse(Buffer.from(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="design-${designId}-source.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export design' }, { status: 500 });
  }
}
