import { NextRequest, NextResponse } from 'next/server';
import { viteServerManager } from '@/lib/vite-server-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; path?: string[] } }
) {
  const server = viteServerManager.getServer(params.id);
  if (!server || server.status !== 'ready') {
    return new NextResponse('Preview not ready', { status: 503 });
  }

  const subPath = params.path?.join('/') || '';
  const fullVitePath = `${server.basePath}${subPath}`;
  const url = new URL(request.url);
  const query = url.search || '';
  const targetUrl = `http://localhost:${server.port}${fullVitePath}${query}`;

  try {
    const headers: Record<string, string> = {};
    const accept = request.headers.get('accept');
    if (accept) headers['accept'] = accept;

    const viteResponse = await fetch(targetUrl, { headers });

    const responseHeaders = new Headers();
    const contentType = viteResponse.headers.get('content-type');
    if (contentType) responseHeaders.set('content-type', contentType);
    responseHeaders.set('cache-control', 'no-store, no-cache, must-revalidate');

    return new NextResponse(viteResponse.body, {
      status: viteResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return new NextResponse('Failed to proxy to Vite server', { status: 502 });
  }
}
