import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

let client: BedrockRuntimeClient | null = null;

/**
 * Valid AWS Bedrock Claude 4.x model IDs (ACTIVE status):
 * - anthropic.claude-opus-4-7 (most capable)
 * - anthropic.claude-sonnet-4-6 (balanced, recommended)
 * - anthropic.claude-sonnet-4-5-20250929-v1:0 (fast)
 * - anthropic.claude-haiku-4-5-20251001-v1:0 (fastest)
 */
const FALLBACK_MODELS = [
  'anthropic.claude-sonnet-4-6',
  'anthropic.claude-sonnet-4-5-20250929-v1:0',
  'anthropic.claude-haiku-4-5-20251001-v1:0',
];

export function getBedrockClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export const MODEL_ID = process.env.BEDROCK_MODEL_ID || FALLBACK_MODELS[0];
