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
      // Dynamic mode: Return SSE stream with progress
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (event: string, data: object) => {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          };

          // Handle client disconnect
          let aborted = false;
          request.signal?.addEventListener('abort', () => {
            console.log(`[SSE] Client aborted start for design ${params.id}`);
            aborted = true;
            controller.close();
          });

          try {
            if (aborted) return;
            send('progress', { step: 'network', message: 'Creating Docker network...' });
            await new Promise(resolve => setTimeout(resolve, 100));

            if (aborted) return;
            send('progress', { step: 'db', message: 'Starting Postgres container...' });
            await new Promise(resolve => setTimeout(resolve, 100));

            if (aborted) return;
            send('progress', { step: 'app', message: 'Starting Next.js app...' });

            const stack = await dockerDesignManager.ensureStack(params.id);

            if (!aborted) {
              send('ready', {
                port: stack.port,
                status: stack.status,
                url: `/api/designs/${params.id}/preview/proxy/`,
                designId: stack.designId,
              });
            }
          } catch (error) {
            if (!aborted) {
              const message = error instanceof Error ? error.message : 'Failed to start stack';
              send('error', { message });
            }
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Static mode: Return JSON response
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
