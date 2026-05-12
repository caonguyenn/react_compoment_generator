export interface ParsedResponse {
  code: string;
  explanation: string;
}

export function parseGenerationResponse(text: string): ParsedResponse {
  // Extract code from tsx/jsx code fence - handle optional newline after fence
  const codeMatch = text.match(/```(?:tsx|jsx|typescript|javascript)?\s*([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : '';

  // Everything after the last code fence is explanation
  const lastFenceEnd = text.lastIndexOf('```');
  const explanation = lastFenceEnd !== -1
    ? text.slice(lastFenceEnd + 3).trim()
    : '';

  return { code, explanation };
}
