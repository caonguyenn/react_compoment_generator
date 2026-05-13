import { NextRequest, NextResponse } from 'next/server';
import { viteServerManager } from '@/lib/vite-server-manager';
import { dockerDesignManager } from '@/lib/docker-design-manager';
import { designService } from '@/lib/design-service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get design metadata to check mode
    const metadata = await designService.getDesignMetadata(params.id);

    if (metadata.mode === 'dynamic') {
      await dockerDesignManager.stopStack(params.id);
    } else {
      await viteServerManager.stopServer(params.id);
    }

    return NextResponse.json({ status: 'stopped', designId: params.id });
  } catch (err) {
    console.error(`[API] Failed to stop preview for design ${params.id}:`, err);
    const message = err instanceof Error ? err.message : 'Failed to stop preview server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
