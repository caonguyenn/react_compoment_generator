import { NextRequest, NextResponse } from 'next/server';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getBedrockClient, MODEL_ID } from '@/lib/bedrock-client';
import { designService } from '@/lib/design-service';
import { packageService } from '@/lib/package-service';
import { parseStructuredResponse } from '@/lib/response-parser';
import { validateImports } from '@/lib/css-validator';
import { DYNAMIC_SYSTEM_PROMPT } from '@/lib/dynamic-prompt-builder';
import { ENHANCED_SYSTEM_PROMPT } from '@/lib/enhanced-prompt-builder';
import type { DesignMode } from '@/types/design';

/**
 * Continue generation for truncated responses
 * Asks AI to generate remaining files based on what was already created
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const designId = params.id;
    const client = getBedrockClient();

    // Load existing design
    const design = await designService.getDesign(designId);
    const existingFiles = Object.entries(design.fileContents).map(([path, content]) => ({
      path,
      content,
    }));

    const mode: DesignMode = design.mode || 'static';

    // Find files that are imported but missing — these are the ones to generate
    const allFiles = existingFiles;
    const importValidation = validateImports(allFiles);
    const missingFiles = importValidation.missingImports;

    // Build existing files context (paths only — no content to save tokens)
    const existingPaths = existingFiles.map(f => `- ${f.path}`).join('\n');

    const missingSection = missingFiles.length > 0
      ? `\nFiles imported but missing (generate THESE):\n${missingFiles.map(f => `- ${f}`).join('\n')}`
      : '\nAll imports resolved — generate any incomplete files listed below.';

    // Find files that appear truncated based on content
    const truncatedFiles = existingFiles
      .filter(f => f.path.match(/\.(tsx?|jsx?)$/) && f.content.length < 200)
      .map(f => `- ${f.path}`);

    const truncatedSection = truncatedFiles.length > 0
      ? `\nPotentially truncated files (regenerate these completely):\n${truncatedFiles.join('\n')}`
      : '';

    const userPrompt = `CONTINUATION REQUEST — output ONLY the ---FILES--- block below, no explanation before it.

Files already on disk:
${existingPaths}
${missingSection}
${truncatedSection}

YOUR RESPONSE MUST START WITH THE LITERAL TEXT "---FILES---" ON THE FIRST LINE. No preamble, no analysis, no intro sentence.

---FILES---
===src/path/to/file.tsx===
[complete file content]
---DEPENDENCIES---
[new packages only, one per line]
---EXPLANATION---
[one sentence summary]`;

    const systemPrompt = mode === 'dynamic' ? DYNAMIC_SYSTEM_PROMPT : ENHANCED_SYSTEM_PROMPT;

    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: {
        maxTokens: 16384,
        temperature: 0.3,
      },
    });

    const response = await client.send(command);
    const stopReason = response.stopReason;
    const responseText = response.output?.message?.content?.[0]?.text;

    if (!responseText) {
      return NextResponse.json(
        { error: 'No response from model' },
        { status: 502 }
      );
    }

    console.log('[DEBUG] Continue generation - Stop reason:', stopReason);

    // Parse response (pass isContinuation=true to skip entry point validation)
    let parsed;
    try {
      parsed = parseStructuredResponse(responseText, mode, true);
      console.log('[DEBUG] Continuation parsed files:', parsed.files.map((f) => f.path));
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Parse failed';
      console.error('[ERROR] Failed to parse continuation response:', errorMessage);
      return NextResponse.json(
        { error: 'Failed to parse AI response', details: errorMessage },
        { status: 422 }
      );
    }

    // Merge with existing files and re-validate
    const mergedFiles = [...existingFiles, ...parsed.files];
    const postValidation = validateImports(mergedFiles);
    const stillMissing = postValidation.missingImports.length;

    if (stillMissing > 0) {
      console.warn(`[WARN] Still missing ${stillMissing} files after continuation`);
    }

    // Write new files
    for (const file of parsed.files) {
      await designService.updateFile(designId, file.path, file.content);
    }

    // Update Prisma schema if continuation provided models
    if (mode === 'dynamic' && parsed.prismaModels) {
      await designService.updatePrismaSchema(designId, parsed.prismaModels);
    }

    // Install new dependencies
    if (parsed.dependencies.length > 0) {
      console.log('[DEBUG] Installing new dependencies:', parsed.dependencies);
      for (const dep of parsed.dependencies) {
        packageService
          .installPackage(designId, dep)
          .catch((error) => {
            console.error(`[ERROR] Failed to install ${dep}:`, error);
          });
      }
    }

    return NextResponse.json({
      designId,
      filesAdded: parsed.files.map(f => f.path),
      dependencies: parsed.dependencies,
      explanation: parsed.explanation,
      truncated: stopReason === 'max_tokens',
      stillIncomplete: stillMissing > 0,
      missingCount: stillMissing,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ERROR] Continue generation failed:', message);

    return NextResponse.json(
      { error: 'Failed to continue generation', details: message },
      { status: 500 }
    );
  }
}
