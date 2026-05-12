import { NextRequest, NextResponse } from 'next/server';
import { viteServerManager } from '@/lib/vite-server-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await viteServerManager.stopServer(params.id);
    return NextResponse.json({ status: 'stopped', designId: params.id });
  } catch (err) {
    console.error(`[API] Failed to stop preview for design ${params.id}:`, err);
    const message = err instanceof Error ? err.message : 'Failed to stop preview server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
