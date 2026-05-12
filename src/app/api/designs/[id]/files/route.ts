import { NextRequest, NextResponse } from 'next/server';
import { designService } from '@/lib/design-service';
import type { UpdateFileRequest } from '@/types/design';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/designs/[id]/files - Get file tree for design
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const design = await designService.getDesign(params.id);

    // Return file tree structure
    return NextResponse.json({
      files: design.files,
      fileContents: design.fileContents,
    });
  } catch (error) {
    console.error(`Error getting files for design ${params.id}:`, error);
    const status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? 'Design not found' : 'Failed to get files' },
      { status }
    );
  }
}

/**
 * PUT /api/designs/[id]/files - Update design files
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const body: UpdateFileRequest = await request.json();

    if (!body.path || typeof body.path !== 'string') {
      return NextResponse.json(
        { error: 'Invalid path: must be a non-empty string' },
        { status: 400 }
      );
    }

    if (typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'Invalid content: must be a string' },
        { status: 400 }
      );
    }

    await designService.updateFile(params.id, body.path, body.content);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error updating files for design ${params.id}:`, error);
    const message = error instanceof Error ? error.message : 'Failed to update file';

    let status = 500;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      status = 404;
    } else if (message.includes('Invalid file path')) {
      status = 400;
    } else if (message.includes('exceeds maximum')) {
      status = 413;
    }

    return NextResponse.json({ error: message }, { status });
  }
}
