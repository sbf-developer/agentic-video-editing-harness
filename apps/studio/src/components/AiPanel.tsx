import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AiEditSummary } from "../types";

export interface AiEditResult extends AiEditSummary {}

interface Props {
  projectId: string;
  onSubmit: (
    prompt: string,
    apiKey?: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ) => Promise<AiEditResult>;
  busy: boolean;
}

type ChatRole = "user" | "assistant" | "error";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  meta?: AiEditSummary;
}

function storageKey(projectId: string) {
  return `studio-chat-${projectId}`;
}

function loadMessages(projectId: string): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function saveMessages(projectId: string, messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(storageKey(projectId), JSON.stringify(messages.slice(-50)));
  } catch {
    /* ignore */
  }
}

const EXAMPLE_PROMPTS = [
  "Cut a 15s TikTok ad with a strong hook",
  "Add title text on the first clip",
  "Trim clip 2 to 3 seconds and add crossfades",
  "Add background music from my audio assets",
];

export function AiPanel({ projectId, onSubmit, busy }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(projectId));
  const [draft, setDraft] = useState("");
  const [serverKeyConfigured, setServerKeyConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadMessages(projectId));
    setDraft("");
  }, [projectId]);

  useEffect(() => {
    saveMessages(projectId, messages);
  }, [projectId, messages]);

  useEffect(() => {
    api<{ aiConfigured: boolean }>("/api/config")
      .then((c) => setServerKeyConfigured(c.aiConfigured))
      .catch(() => setServerKeyConfigured(false));
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy, scrollToBottom]);

  const canSend =
    draft.trim().length > 0 &&
    !busy &&
    serverKeyConfigured !== null &&
    (serverKeyConfigured || apiKey.trim().length > 0);

  async function send(text?: string) {
    const prompt = (text ?? draft).trim();
    if (!prompt || busy) return;
    if (!serverKeyConfigured && !apiKey.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setDraft("");
    inputRef.current?.focus();

    const history = nextMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const result = await onSubmit(
        prompt,
        serverKeyConfigured ? undefined : apiKey,
        history,
      );

      const summary =
        result.clipCount === 0
          ? "Timeline cleared. Upload more media or try a different prompt."
          : `Done — ${result.summary}. Scrub the timeline or hit play to review.`;

      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: summary,
          meta: result,
        },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "error",
          content: String(e),
        },
      ]);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void send();
    }
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <aside className="ai-panel">
      <header className="ai-head">
        <div className="ai-head-title">
          <span className="ai-head-icon" aria-hidden>✦</span>
          <div>
            <h2>Editor</h2>
          </div>
        </div>
        <button
          type="button"
          className={`ai-settings-btn ${showSettings ? "active" : ""}`}
          onClick={() => setShowSettings((v) => !v)}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </header>

      {showSettings && (
        <div className="ai-settings">
          {serverKeyConfigured === true ? (
            <>
              <p className="ai-status connected">DeepSeek connected</p>
              <p className="ai-capabilities">
                Can cut, reorder, trim clips · add text overlays · set transitions · add music/VO · reframe
              </p>
            </>
          ) : serverKeyConfigured === false ? (
            <label className="ai-key-field">
              <span>API key</span>
              <input
                type="password"
                className="input sm"
                placeholder="sk-... or set DEEPSEEK_API_KEY in .env"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
          ) : (
            <p className="ai-status">Checking connection…</p>
          )}
        </div>
      )}

      <div className="ai-chat" ref={chatRef}>
        {messages.length === 0 && !busy && (
          <div className="ai-empty">
            <p>Describe your edit — the AI updates the timeline, text, audio, and cuts.</p>
            <div className="ai-examples">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button key={ex} type="button" className="ai-example" onClick={() => void send(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`ai-msg ${msg.role}`}>
            {msg.role !== "user" && (
              <span className="ai-msg-avatar" aria-hidden>
                {msg.role === "error" ? "!" : "✦"}
              </span>
            )}
            <div className="ai-msg-body">
              <p>{msg.content}</p>
            </div>
          </div>
        ))}

        {busy && (
          <div className="ai-msg assistant typing">
            <span className="ai-msg-avatar" aria-hidden>✦</span>
            <div className="ai-msg-body">
              <span className="ai-typing">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="ai-composer">
        <div className="ai-composer-box">
          <textarea
            ref={inputRef}
            className="ai-composer-input"
            rows={1}
            placeholder="Cut a 15s ad, add text, trim clips…"
            value={draft}
            disabled={busy}
            onChange={(e) => {
              setDraft(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="ai-send"
            disabled={!canSend}
            onClick={() => void send()}
            title="Send (Enter)"
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </aside>
  );
}
