import { NextRequest, NextResponse } from 'next/server';
import { viteServerManager } from '@/lib/vite-server-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serverInfo = await viteServerManager.ensureServer(params.id);
    return NextResponse.json({
      port: serverInfo.port,
      status: serverInfo.status,
      url: `/api/designs/${params.id}/preview/proxy/`,
      designId: serverInfo.designId,
    });
  } catch (err) {
    console.error(`[API] Failed to start preview for design ${params.id}:`, err);
    const message = err instanceof Error ? err.message : 'Failed to start preview server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
