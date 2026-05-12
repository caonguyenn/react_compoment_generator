#!/usr/bin/env node
/**
 * Test script to find which Claude model IDs work in your AWS Bedrock account
 * Run with: node test-bedrock-models.js
 */

const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const fs = require('fs');
const path = require('path');

// Simple .env.local parser
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      process.env[key] = value;
    }
  });
}

const MODELS_TO_TEST = [
  // Claude 4.x models (ACTIVE status)
  'anthropic.claude-opus-4-7',
  'anthropic.claude-sonnet-4-6',
  'anthropic.claude-sonnet-4-5-20250929-v1:0',
  'anthropic.claude-haiku-4-5-20251001-v1:0',
  'anthropic.claude-opus-4-5-20251101-v1:0',
];

async function testModel(client, modelId) {
  try {
    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: 'user',
          content: [{ text: 'Hello' }],
        },
      ],
      inferenceConfig: {
        maxTokens: 10,
        temperature: 0.1,
      },
    });

    await client.send(command);
    return { modelId, status: '✅ WORKS' };
  } catch (error) {
    return {
      modelId,
      status: '❌ FAILED',
      error: error.message.substring(0, 80)
    };
  }
}

async function main() {
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  AWS Bedrock Claude Model ID Tester                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`Region: ${region}\n`);

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Error: AWS credentials not found in .env.local');
    console.error('Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY\n');
    process.exit(1);
  }

  const client = new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  console.log('Testing models (this may take 30-60 seconds)...\n');

  const results = [];
  for (const modelId of MODELS_TO_TEST) {
    process.stdout.write(`Testing ${modelId}... `);
    const result = await testModel(client, modelId);
    results.push(result);
    console.log(result.status);
    if (result.error) {
      console.log(`  └─ ${result.error}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('SUMMARY\n');

  const working = results.filter(r => r.status === '✅ WORKS');
  if (working.length > 0) {
    console.log('✅ Working model IDs (add one to your .env.local):');
    working.forEach(r => console.log(`   BEDROCK_MODEL_ID=${r.modelId}`));
  } else {
    console.log('❌ No working models found. Check:');
    console.log('   1. AWS credentials are correct');
    console.log('   2. Bedrock is enabled in your region');
    console.log('   3. Claude models are available in your region');
  }

  console.log('');
}

main().catch(console.error);
