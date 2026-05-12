import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { designService } from '@/lib/design-service';

const execAsync = promisify(exec);

const DESIGN_ID_REGEX = /^[A-Za-z0-9_-]+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const designId = params.id;

    if (!DESIGN_ID_REGEX.test(designId)) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }

    const designPath = designService.getDesignPath(designId);

    // Check if design exists
    try {
      await fs.access(designPath);
    } catch {
      return NextResponse.json(
        { error: 'Design not found' },
        { status: 404 }
      );
    }

    // Run vite build in the design directory
    try {
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: designPath,
        timeout: 60000, // 60 second timeout
        env: { ...process.env, NODE_ENV: 'production' },
      });

      console.log('Build output:', stdout);
      if (stderr) {
        console.error('Build stderr:', stderr);
      }
    } catch (error) {
      console.error('Build failed:', error);
      return NextResponse.json({ error: 'Build failed' }, { status: 500 });
    }

    // Verify dist/ directory was created
    const distPath = path.join(designPath, 'dist');
    try {
      await fs.access(distPath);
    } catch {
      return NextResponse.json(
        { error: 'Build completed but no output was produced' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Build error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
