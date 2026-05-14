import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ChatMessage } from '@/types';

interface ChatHistoryProps {
  messages: ChatMessage[];
  isLoading: boolean;
  truncated?: boolean;
  onContinue?: () => void;
}

export default function ChatHistory({ messages, isLoading, truncated, onContinue }: ChatHistoryProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, shouldAutoScroll]);

  if (messages.length === 0 && !isLoading) {
    return null;
  }

  const displayedMessages = isCollapsed ? messages.slice(-3) : messages;
  const hiddenCount = messages.length - displayedMessages.length;

  return (
    <div className="space-y-3">
      {/* Collapse/Expand Toggle */}
      {messages.length > 3 && (
        <div className="flex justify-center">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-claude-gray-600 bg-claude-gray-50 hover:bg-claude-gray-100 rounded-full transition-colors"
          >
            {isCollapsed ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Show {hiddenCount} older messages
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Collapse history
              </>
            )}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-3">
      {displayedMessages.map((msg) => (
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

      {truncated && !isLoading && onContinue && (
        <div className="flex justify-center py-4">
          <button
            onClick={onContinue}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-claude-coral rounded-lg hover:bg-claude-coral/90 transition-colors shadow-sm hover:shadow-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            <span>Continue Generation</span>
            <span className="text-xs opacity-80 ml-1">(truncated)</span>
          </button>
        </div>
      )}

      {/* Auto-scroll anchor */}
      <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
