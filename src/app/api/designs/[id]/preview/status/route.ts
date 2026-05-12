import { NextRequest, NextResponse } from 'next/server';
import { viteServerManager } from '@/lib/vite-server-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const server = viteServerManager.getServer(params.id);
    if (!server) {
      return NextResponse.json({
        status: 'stopped',
        port: null,
        url: null,
        designId: params.id,
      });
    }
    return NextResponse.json({
      status: server.status,
      port: server.port,
      url: `/api/designs/${params.id}/preview/proxy/`,
      designId: server.designId,
      startedAt: server.startedAt,
      lastAccess: server.lastAccess,
    });
  } catch (err) {
    console.error(`[API] Failed to get preview status for design ${params.id}:`, err);
    const message = err instanceof Error ? err.message : 'Failed to get preview status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
