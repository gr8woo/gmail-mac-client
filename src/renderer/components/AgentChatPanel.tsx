import { GripVertical, SendHorizontal } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "./ui/button";
import type { AgentChatResponse, AgentProviderId, AgentProviderStatus } from "../../shared/agent";

interface AgentChatPanelProps {
  width: number;
  providers: AgentProviderStatus[];
  selectedProviderId: AgentProviderId;
  messages: ChatMessage[];
  onWidthChange(width: number): void;
  onSelectedProviderChange(providerId: AgentProviderId): void;
  onMessagesChange(messages: ChatMessage[]): void;
  onSendMessage(providerId: AgentProviderId, message: string): Promise<AgentChatResponse>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
}

const minPanelWidth = 320;
const maxPanelWidth = 560;

export function AgentChatPanel({
  width,
  providers,
  selectedProviderId,
  messages,
  onWidthChange,
  onSelectedProviderChange,
  onMessagesChange,
  onSendMessage
}: AgentChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const trimmedDraft = draft.trim();
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const canSend = Boolean(trimmedDraft && !isSending && (providers.length === 0 || selectedProvider?.authenticated));

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, isSending]);

  async function sendMessage() {
    if (!canSend) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      text: trimmedDraft
    };
    onMessagesChange([...messages, userMessage]);
    setDraft("");
    setIsSending(true);

    try {
      const response = await onSendMessage(selectedProviderId, trimmedDraft);
      onMessagesChange([
        ...messages,
        userMessage,
        {
          id: createMessageId(),
          role: "assistant",
          text: response.message
        }
      ]);
    } catch (caught) {
      onMessagesChange([
        ...messages,
        userMessage,
        {
          id: createMessageId(),
          role: "error",
          text: caught instanceof Error ? caught.message : "AI 응답을 가져오지 못했습니다."
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;

    function move(pointerEvent: PointerEvent) {
      const nextWidth = clampWidth(startWidth + startX - pointerEvent.clientX);
      onWidthChange(nextWidth);
    }

    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <aside className="agent-panel" aria-label="AI assistant" style={{ width }}>
      <button
        type="button"
        className="agent-resize-handle"
        aria-label="Resize AI assistant"
        onPointerDown={startResize}
      >
        <GripVertical aria-hidden="true" />
      </button>

      <header className="agent-panel-header">
        <div>
          <h2>AI assistant</h2>
          <p>{selectedProvider?.name ?? "AI service"}</p>
        </div>
        <select
          className="agent-provider-select"
          aria-label="AI service"
          value={selectedProviderId}
          onChange={(event) => onSelectedProviderChange(event.currentTarget.value as AgentProviderId)}
        >
          {providers.length === 0 ? (
            <option value={selectedProviderId}>확인 중</option>
          ) : (
            providers.map((provider) => (
              <option key={provider.id} value={provider.id} disabled={!provider.authenticated}>
                {provider.authenticated ? provider.name : `${provider.name} (연결 필요)`}
              </option>
            ))
          )}
        </select>
      </header>

      <div className="agent-message-list" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`agent-message agent-message-${message.role}`}>
            <MessageContent message={message} />
          </div>
        ))}
        {isSending ? <div className="agent-message agent-message-assistant">생각 중...</div> : null}
        <div ref={latestMessageRef} className="agent-message-scroll-anchor" aria-hidden="true" />
      </div>

      <form
        className="agent-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <textarea
          aria-label="AI message"
          placeholder="메일 요약, 초안 작성, 설정 변경 계획을 물어보세요"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }

            event.preventDefault();
            void sendMessage();
          }}
        />
        <Button type="submit" size="icon" aria-label="Send message" disabled={!canSend}>
          <SendHorizontal aria-hidden="true" />
        </Button>
      </form>
    </aside>
  );
}

function MessageContent({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <>{message.text}</>;
  }

  return (
    <div className="agent-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
    </div>
  );
}

function clampWidth(width: number): number {
  return Math.min(maxPanelWidth, Math.max(minPanelWidth, Math.round(width)));
}

function createMessageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
