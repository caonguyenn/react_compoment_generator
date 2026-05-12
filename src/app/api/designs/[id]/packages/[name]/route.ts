import { NextRequest, NextResponse } from 'next/server';
import { packageService } from '@/lib/package-service';
import { designService } from '@/lib/design-service';

/**
 * DELETE /api/designs/[id]/packages/[name]
 * Remove design-specific package (cannot remove base packages)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; name: string } }
) {
  try {
    const { id, name } = params;

    // Verify design exists
    try {
      await designService.getDesign(id);
    } catch {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 });
    }

    // Decode package name (handles scoped packages like @radix-ui/react-slot)
    const packageName = decodeURIComponent(name);

    // Remove package
    const result = await packageService.removePackage(id, packageName);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Removal failed', result },
        { status: 400 }
      );
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Failed to remove package:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove package';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
