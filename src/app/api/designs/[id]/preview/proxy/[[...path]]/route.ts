import { NextRequest, NextResponse } from 'next/server';
import { viteServerManager } from '@/lib/vite-server-manager';
import { dockerDesignManager } from '@/lib/docker-design-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; path?: string[] } }
) {
  // Check both managers for running preview
  const server = viteServerManager.getServer(params.id);
  const stack = dockerDesignManager.getStack(params.id);

  // Update lastAccess for idle timeout tracking
  if (stack) {
    stack.lastAccess = Date.now();
  }

  const port = server?.port ?? stack?.port;
  const isReady = (server?.status === 'ready') || (stack?.status === 'ready');

  if (!port || !isReady) {
    return new NextResponse('Preview not ready', { status: 503 });
  }

  const subPath = params.path?.join('/') || '';
  // For static mode, use basePath; for dynamic, proxy directly
  const basePath = server?.basePath || '/';
  const fullPath = basePath === '/' ? `/${subPath}` : `${basePath}${subPath}`;
  const url = new URL(request.url);
  const query = url.search || '';
  const targetUrl = `http://localhost:${port}${fullPath}${query}`;

  try {
    const headers: Record<string, string> = {};
    const accept = request.headers.get('accept');
    if (accept) headers['accept'] = accept;

    const response = await fetch(targetUrl, { headers });

    const responseHeaders = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) responseHeaders.set('content-type', contentType);
    responseHeaders.set('cache-control', 'no-store, no-cache, must-revalidate');

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return new NextResponse('Failed to proxy to preview server', { status: 502 });
  }
}
