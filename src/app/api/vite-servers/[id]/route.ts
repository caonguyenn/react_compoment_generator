import { NextRequest, NextResponse } from 'next/server';
import { viteServerManager } from '@/lib/vite-server-manager';

/**
 * POST /api/vite-servers/[id] - Start Vite server for design
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid design ID' },
        { status: 400 }
      );
    }

    // Start or get existing server
    const serverInfo = await viteServerManager.ensureServer(id);

    return NextResponse.json({
      success: true,
      server: {
        designId: serverInfo.designId,
        port: serverInfo.port,
        status: serverInfo.status,
        url: serverInfo.url,
        startedAt: serverInfo.startedAt,
      },
    });
  } catch (error) {
    console.error('[API] Error starting Vite server:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNotFound = message.includes('not found');

    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}

/**
 * GET /api/vite-servers/[id] - Get Vite server status and info
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid design ID' },
        { status: 400 }
      );
    }

    const serverInfo = viteServerManager.getServer(id);

    if (!serverInfo) {
      return NextResponse.json(
        { error: 'Server not running' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      server: {
        designId: serverInfo.designId,
        port: serverInfo.port,
        status: serverInfo.status,
        url: serverInfo.url,
        startedAt: serverInfo.startedAt,
        lastAccess: serverInfo.lastAccess,
        pid: serverInfo.pid,
      },
    });
  } catch (error) {
    console.error('[API] Error getting Vite server info:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/vite-servers/[id] - Stop Vite server
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid design ID' },
        { status: 400 }
      );
    }

    await viteServerManager.stopServer(id);

    return NextResponse.json({
      success: true,
      message: 'Server stopped',
    });
  } catch (error) {
    console.error('[API] Error stopping Vite server:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
