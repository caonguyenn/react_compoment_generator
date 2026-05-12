import { NextRequest, NextResponse } from 'next/server';
import { designService } from '@/lib/design-service';
import { viteServerManager } from '@/lib/vite-server-manager';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/designs/[id] - Get design details with all files
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const design = await designService.getDesign(params.id);
    return NextResponse.json(design);
  } catch (error) {
    console.error(`Error getting design ${params.id}:`, error);
    const status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? 'Design not found' : 'Failed to get design' },
      { status }
    );
  }
}

/**
 * PUT /api/designs/[id] - Update file content or design metadata
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();

    // If body has path + content, it's a file save
    if (body.path && typeof body.content === 'string') {
      await designService.updateFile(params.id, body.path, body.content);
    } else {
      await designService.updateMetadata(params.id, body);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error updating design ${params.id}:`, error);
    const status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? 'Design not found' : 'Failed to update design' },
      { status }
    );
  }
}

/**
 * DELETE /api/designs/[id] - Delete design
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Stop running Vite server first to prevent orphaned processes and port leaks
    await viteServerManager.stopServer(params.id);
    await designService.deleteDesign(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error deleting design ${params.id}:`, error);
    return NextResponse.json(
      { error: 'Failed to delete design' },
      { status: 500 }
    );
  }
}
