import { NextRequest, NextResponse } from 'next/server';
import { designService } from '@/lib/design-service';
import type { CreateDesignRequest } from '@/types/design';

/**
 * GET /api/designs - List all designs
 */
export async function GET() {
  try {
    const designs = await designService.listDesigns();
    return NextResponse.json(designs);
  } catch (error) {
    console.error('Error listing designs:', error);
    return NextResponse.json(
      { error: 'Failed to list designs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/designs - Create new design
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateDesignRequest = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Invalid name: must be a non-empty string' },
        { status: 400 }
      );
    }

    const design = await designService.createDesign(
      body.name,
      body.prompt || '',
      body.initialCode
    );

    return NextResponse.json(design, { status: 201 });
  } catch (error) {
    console.error('Error creating design:', error);
    const message = error instanceof Error ? error.message : 'Failed to create design';
    const status = message.includes('Maximum design count') ? 507 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
