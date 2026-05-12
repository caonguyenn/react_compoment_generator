interface PreviewErrorProps {
  message: string;
}

export default function PreviewError({ message }: PreviewErrorProps) {
  const isSyntaxError = message.includes('Unexpected token') ||
                       message.includes('Expected') ||
                       message.includes('SyntaxError');

  return (
    <div className="absolute inset-0 bg-red-50 bg-opacity-90 flex items-center justify-center p-4 z-10">
      <div className="bg-white border-2 border-red-300 rounded-lg p-6 max-w-2xl">
        <h3 className="text-lg font-semibold text-red-800 mb-3">⚠️ Preview Error</h3>
        <div className="bg-red-100 border border-red-200 rounded p-3 mb-4">
          <p className="text-xs text-red-700 font-mono whitespace-pre-wrap">{message}</p>
        </div>

        {isSyntaxError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
            <p className="text-xs text-yellow-800">
              <strong>💡 This looks like a syntax error in the generated code.</strong><br/>
              The AI generated invalid JSX. Try:
            </p>
            <ul className="text-xs text-yellow-700 mt-2 ml-4 list-disc space-y-1">
              <li>Click the <strong>Generate</strong> button again (regenerate)</li>
              <li>Simplify your prompt (e.g., &ldquo;a simple blue button&rdquo;)</li>
              <li>Check the code editor for mismatched tags</li>
            </ul>
          </div>
        )}

        <p className="text-xs text-gray-600 italic">
          Tip: Complex components may occasionally have errors. Try regenerating or editing the code directly.
        </p>
      </div>
    </div>
  );
}
