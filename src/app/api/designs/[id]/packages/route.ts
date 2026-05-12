import { NextRequest, NextResponse } from 'next/server';
import { packageService } from '@/lib/package-service';
import { designService } from '@/lib/design-service';
import type { InstallPackageRequest } from '@/types/design';

/**
 * GET /api/designs/[id]/packages
 * List all packages (base + design-specific)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Verify design exists
    try {
      await designService.getDesign(id);
    } catch {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }

    // List packages
    const packages = await packageService.listPackages(id);

    return NextResponse.json({ packages });
  } catch (error) {
    console.error('Failed to list packages:', error);
    const message = error instanceof Error ? error.message : 'Failed to list packages';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/designs/[id]/packages
 * Install package (queued, synchronous response up to 60s)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Verify design exists
    try {
      await designService.getDesign(id);
    } catch {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }

    // Parse request body
    const body: InstallPackageRequest = await request.json();
    const { name, version } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Package name required' }, { status: 400 });
    }

    // Install package (queued per design)
    const result = await packageService.installPackage(id, name, version);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Installation failed', result },
        { status: 400 }
      );
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Failed to install package:', error);
    const message = error instanceof Error ? error.message : 'Failed to install package';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
