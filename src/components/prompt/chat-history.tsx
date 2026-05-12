import type { ChatMessage } from '@/types';

interface ChatHistoryProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

export default function ChatHistory({ messages, isLoading }: ChatHistoryProps) {
  if (messages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.role === 'user' ? (
            <div className="flex justify-end">
              <div className="bg-claude-gray-100 rounded-2xl rounded-br-md px-3.5 py-2.5 max-w-[85%]">
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {msg.images.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`image ${i + 1}`}
                        className="h-20 w-20 object-cover rounded-lg border border-claude-gray-200"
                      />
                    ))}
                  </div>
                )}
                {msg.content && (
                  <p className="text-sm text-claude-gray-700 whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-start">
              <div className="flex gap-2 max-w-[90%]">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-claude-coral/10 flex items-center justify-center mt-0.5">
                  <svg className="w-3.5 h-3.5 text-claude-coral" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <div className="bg-white border border-claude-gray-200 rounded-2xl rounded-bl-md px-3.5 py-2.5">
                  <p className="text-sm text-claude-gray-600 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {isLoading && (
        <div className="flex justify-start">
          <div className="flex gap-2">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-claude-coral/10 flex items-center justify-center mt-0.5">
              <svg className="w-3.5 h-3.5 text-claude-coral animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div className="bg-white border border-claude-gray-200 rounded-2xl px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-claude-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-claude-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-claude-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
