#!/bin/bash

# Test script to verify component generation works end-to-end

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Testing Component Generation                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found"
    echo "Please create .env.local with your AWS credentials"
    exit 1
fi

# Make sure dev server is running
if ! lsof -ti:3001 > /dev/null 2>&1 && ! lsof -ti:3000 > /dev/null 2>&1; then
    echo "❌ Error: Next.js dev server is not running"
    echo "Start it with: npm run dev"
    exit 1
fi

PORT=3001
if lsof -ti:3000 > /dev/null 2>&1; then
    PORT=3000
fi

echo "✓ Dev server is running on port $PORT"
echo ""
echo "Testing API endpoint..."

# Test the generation API
RESPONSE=$(curl -s -X POST "http://localhost:$PORT/api/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a simple blue button that says Click me"
  }' \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo ""
echo "HTTP Status: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" == "200" ]; then
    echo "✅ SUCCESS! Component generated"
    echo ""
    echo "Response preview:"
    echo "$BODY" | jq -r '.code' | head -20
    echo ""
    echo "Full response saved to: /tmp/test-generation-response.json"
    echo "$BODY" | jq '.' > /tmp/test-generation-response.json
    echo ""
    echo "🎉 Everything is working! Open http://localhost:$PORT in your browser"
elif [ "$HTTP_STATUS" == "422" ]; then
    echo "❌ FAILED: Could not parse component from response"
    echo ""
    echo "Error details:"
    echo "$BODY" | jq -r '.error'
    echo ""
    if echo "$BODY" | jq -e '.rawResponse' > /dev/null 2>&1; then
        echo "Raw response from model:"
        echo "$BODY" | jq -r '.rawResponse'
    fi
else
    echo "❌ FAILED with status $HTTP_STATUS"
    echo ""
    echo "Error response:"
    echo "$BODY" | jq '.'
fi

echo ""
