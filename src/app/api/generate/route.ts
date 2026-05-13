import { NextRequest, NextResponse } from 'next/server';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getBedrockClient, MODEL_ID } from '@/lib/bedrock-client';
import { buildMessages } from '@/lib/prompt-builder';
import { buildEnhancedMessages } from '@/lib/enhanced-prompt-builder';
import { buildDynamicMessages } from '@/lib/dynamic-prompt-builder';
import { parseGenerationResponse } from '@/lib/component-parser';
import {
  parseStructuredResponse,
  extractNameFromPrompt,
} from '@/lib/response-parser';
import { designService } from '@/lib/design-service';
import { packageService } from '@/lib/package-service';
import type { GenerateRequest, DesignMode } from '@/types/design';

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { prompt, designId, mode = 'quick', designMode, images } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Mode: quick (backwards compatible, returns single code string)
    if (mode === 'quick') {
      return handleQuickMode(prompt, images);
    }

    // Mode: full (new Vite-based multi-file generation)
    if (mode === 'full') {
      return handleFullMode(prompt, designId, designMode, images);
    }

    return NextResponse.json(
      { error: 'Invalid mode: must be "quick" or "full"' },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Generation error:', message);

    if (message.includes('ThrottlingException')) {
      return NextResponse.json(
        { error: 'Rate limited. Please wait and try again.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate component', details: message },
      { status: 500 }
    );
  }
}

/** Convert base64 data URL to Bedrock image content block */
function dataUrlToImageBlock(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return null;
  const format = match[1] as 'jpeg' | 'png' | 'gif' | 'webp';
  const bytes = Buffer.from(match[2], 'base64');
  return { image: { format, source: { bytes } } };
}

/**
 * Quick mode: legacy single-file generation (backwards compatible)
 */
async function handleQuickMode(prompt: string, images?: string[]): Promise<NextResponse> {
  const client = getBedrockClient();
  const { system, messages } = buildMessages(prompt);

  // Inject image blocks into user message if provided
  if (images && images.length > 0) {
    const imageBlocks = images.flatMap((url) => {
      const block = dataUrlToImageBlock(url);
      return block ? [block] : [];
    });
    if (imageBlocks.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messages[messages.length - 1] as any).content = [
        ...imageBlocks,
        ...messages[messages.length - 1].content,
      ];
    }
  }

  console.log('[DEBUG] Quick mode - Using model ID:', MODEL_ID);

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system,
    messages,
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.7,
    },
  });

  const response = await client.send(command);
  const responseText = response.output?.message?.content?.[0]?.text;

  if (!responseText) {
    return NextResponse.json(
      { error: 'No response from model' },
      { status: 502 }
    );
  }

  console.log('[DEBUG] Response text preview:', responseText.substring(0, 500));

  const parsed = parseGenerationResponse(responseText);

  if (!parsed.code) {
    console.error('[ERROR] Failed to parse. Full response:', responseText);
    return NextResponse.json(
      { error: 'Failed to parse component from response', rawResponse: responseText.substring(0, 1000) },
      { status: 422 }
    );
  }

  return NextResponse.json(parsed);
}

/**
 * Full mode: Multi-file generation with design creation (Vite or Next.js)
 */
async function handleFullMode(
  prompt: string,
  existingDesignId?: string,
  requestedMode?: DesignMode,
  images?: string[]
): Promise<NextResponse> {
  const client = getBedrockClient();

  // Load existing design files if refining
  let existingFilesArray: Array<{ path: string; content: string }> = [];
  let existingFilesRecord: Record<string, string> = {};
  let existingDeps: string[] = [];
  let actualMode: DesignMode = requestedMode || 'static';

  if (existingDesignId) {
    try {
      const design = await designService.getDesign(existingDesignId);
      existingFilesArray = Object.entries(design.fileContents).map(([path, content]) => ({
        path,
        content,
      }));
      existingFilesRecord = design.fileContents;
      existingDeps = design.dependencies;
      actualMode = design.mode; // Use existing design's mode

      // Add prompt to history
      await designService.addPrompt(existingDesignId, prompt);

      console.log(`[DEBUG] Refining existing design: ${existingDesignId} (mode: ${actualMode})`);
      console.log(`[DEBUG] Loaded ${existingFilesArray.length} existing files`);
    } catch {
      return NextResponse.json(
        { error: 'Design not found' },
        { status: 404 }
      );
    }
  }

  // Build prompt based on design mode
  const { system, messages } = actualMode === 'dynamic'
    ? buildDynamicMessages(prompt, existingFilesRecord, existingDeps)
    : buildEnhancedMessages(prompt, existingFilesArray, existingDeps);

  // Inject image blocks into user message if provided
  if (images && images.length > 0) {
    const imageBlocks = images.flatMap((url) => {
      const block = dataUrlToImageBlock(url);
      return block ? [block] : [];
    });
    if (imageBlocks.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messages[messages.length - 1] as any).content = [
        ...imageBlocks,
        ...messages[messages.length - 1].content,
      ];
    }
  }

  console.log('[DEBUG] Full mode - Using model ID:', MODEL_ID);
  console.log('[DEBUG] Design mode:', actualMode);
  console.log('[DEBUG] Existing files:', existingFilesArray.length);

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system,
    messages,
    inferenceConfig: {
      maxTokens: 8192,
      temperature: 0.7,
    },
  });

  const response = await client.send(command);
  const responseText = response.output?.message?.content?.[0]?.text;
  const stopReason = response.stopReason;

  if (!responseText) {
    return NextResponse.json(
      { error: 'No response from model' },
      { status: 502 }
    );
  }

  console.log('[DEBUG] Response text preview:', responseText.substring(0, 500));
  console.log('[DEBUG] Stop reason:', stopReason);

  if (stopReason === 'max_tokens') {
    console.warn('[WARN] Response was truncated due to max_tokens limit');
  }

  // Parse structured response
  let parsed;
  try {
    parsed = parseStructuredResponse(responseText);
    console.log('[DEBUG] Parsed files:', parsed.files.map((f) => f.path));
    console.log('[DEBUG] Parsed dependencies:', parsed.dependencies);
  } catch (parseError) {
    const errorMessage = parseError instanceof Error ? parseError.message : 'Parse failed';
    console.error('[ERROR] Failed to parse structured response:', errorMessage);
    console.error('[ERROR] Full response:', responseText);
    return NextResponse.json(
      { error: 'Failed to parse AI response', details: errorMessage },
      { status: 422 }
    );
  }

  // Validate dependency count (max 5 new deps per generation)
  const newDeps = parsed.dependencies.filter((dep) => !existingDeps.includes(dep));
  if (newDeps.length > 5) {
    return NextResponse.json(
      { error: 'Too many new dependencies requested (max 5 per generation)' },
      { status: 400 }
    );
  }

  // Create or update design
  let finalDesignId: string;

  if (existingDesignId) {
    // Update existing design
    finalDesignId = existingDesignId;

    for (const file of parsed.files) {
      await designService.updateFile(finalDesignId, file.path, file.content);
    }

    console.log(`[DEBUG] Updated design ${finalDesignId} with ${parsed.files.length} files`);
  } else {
    // Create new design
    const designName = extractNameFromPrompt(prompt);

    // Validate entry file based on mode
    const expectedEntryPath = actualMode === 'dynamic' ? 'src/app/page.tsx' : 'src/App.tsx';
    const entryFile = parsed.files.find((f) => f.path === expectedEntryPath);

    if (!entryFile) {
      return NextResponse.json(
        {
          error: `AI did not generate required ${expectedEntryPath} file for ${actualMode} mode`,
          generatedFiles: parsed.files.map(f => f.path)
        },
        { status: 422 }
      );
    }

    const design = await designService.createDesign(
      designName,
      prompt,
      entryFile.content,
      actualMode
    );
    finalDesignId = design.id;

    // Write additional files (all except entry file)
    const otherFiles = parsed.files.filter((f) => f.path !== expectedEntryPath);
    for (const file of otherFiles) {
      await designService.updateFile(finalDesignId, file.path, file.content);
    }

    console.log(`[DEBUG] Created ${actualMode} design ${finalDesignId} with ${parsed.files.length} files`);
  }

  // Auto-install missing dependencies (fire and forget, client polls status)
  if (parsed.dependencies.length > 0) {
    console.log('[DEBUG] Queueing package installs:', parsed.dependencies);

    for (const dep of parsed.dependencies) {
      // Fire and forget - errors logged but not blocking
      packageService
        .installPackage(finalDesignId, dep)
        .then((result) => {
          if (result.success) {
            console.log(`[DEBUG] Installed ${dep} in ${result.duration}ms`);
          } else {
            console.error(`[ERROR] Failed to install ${dep}: ${result.error}`);
          }
        })
        .catch((error) => {
          console.error(`[ERROR] Install promise rejected for ${dep}:`, error);
        });
    }
  }

  return NextResponse.json({
    designId: finalDesignId,
    files: parsed.files,
    dependencies: parsed.dependencies,
    explanation: parsed.explanation,
  });
}
