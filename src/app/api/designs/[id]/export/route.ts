import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import JSZip from 'jszip';
import { designService } from '@/lib/design-service';

const DESIGN_ID_REGEX = /^[A-Za-z0-9_-]+$/;

async function addDirectoryToZip(zip: JSZip, dirPath: string, zipPath: string = '') {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip symlinks to prevent following node_modules or escaping the design directory
    if (entry.isSymbolicLink()) continue;

    const fullPath = path.join(dirPath, entry.name);
    const zipEntryPath = zipPath ? path.join(zipPath, entry.name) : entry.name;

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
    const distPath = path.join(designPath, 'dist');

    // Check if design exists
    try {
      await fs.access(designPath);
    } catch {
      return NextResponse.json(
        { error: 'Design not found' },
        { status: 404 }
      );
    }

    // Check if dist/ exists
    try {
      await fs.access(distPath);
    } catch {
      return NextResponse.json(
        { error: 'Build not found. Run build first.' },
        { status: 404 }
      );
    }

    // Create ZIP archive
    const zip = new JSZip();

    // Add all files from dist/ directory
    await addDirectoryToZip(zip, distPath);

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    // Return ZIP file
    return new NextResponse(Buffer.from(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="design-${designId}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export design' },
      { status: 500 }
    );
  }
}
