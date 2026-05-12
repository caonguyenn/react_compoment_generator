import { NextRequest, NextResponse } from 'next/server';
import { designService } from '@/lib/design-service';
import type { DesignChatMessage } from '@/types/design';

interface RouteParams {
  params: { id: string };
}

/** GET /api/designs/[id]/history - return chat history for a design */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const design = await designService.getDesign(params.id);
    return NextResponse.json(design.chatHistory);
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? 'Design not found' : 'Failed to get history' },
      { status }
    );
  }
}

/** POST /api/designs/[id]/history - append a message to chat history */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const message: DesignChatMessage = await request.json();
    if (!message.id || !message.role || !message.content || !message.timestamp) {
      return NextResponse.json({ error: 'Invalid message payload' }, { status: 400 });
    }
    await designService.appendChatMessage(params.id, message);
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? 'Design not found' : 'Failed to save message' },
      { status }
    );
  }
}
