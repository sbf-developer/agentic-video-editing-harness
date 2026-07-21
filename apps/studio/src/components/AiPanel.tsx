import { useEffect, useState } from "react";
import { api } from "../api";

interface Props {
  onSubmit: (prompt: string, apiKey?: string) => Promise<void>;
  busy: boolean;
}

export function AiPanel({ onSubmit, busy }: Props) {
  const [prompt, setPrompt] = useState("");
  const [serverKeyConfigured, setServerKeyConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    api<{ aiConfigured: boolean }>("/api/config")
      .then((c) => setServerKeyConfigured(c.aiConfigured))
      .catch(() => setServerKeyConfigured(false));
  }, []);

  const canSubmit =
    prompt.trim() && (serverKeyConfigured || apiKey.trim()) && serverKeyConfigured !== null;

  return (
    <aside className="panel ai-panel">
      <header className="panel-head">
        <h2>AI</h2>
      </header>

      <p className="panel-desc">Describe your edit — AI builds the timeline from uploaded media.</p>

      {serverKeyConfigured === true && (
        <p className="status-ok">DeepSeek connected</p>
      )}
      {serverKeyConfigured === false && (
        <label className="field">
          <span>API key</span>
          <input
            type="password"
            className="input"
            placeholder="sk-... or apps/studio/.env"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
      )}

      <label className="field">
        <span>Prompt</span>
        <textarea
          className="input textarea"
          rows={6}
          placeholder="15s vertical — open on the hero shot, quick cuts, fade out on logo"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>

      <button
        type="button"
        className="btn primary full"
        disabled={busy || !canSubmit}
        onClick={() => onSubmit(prompt, serverKeyConfigured ? undefined : apiKey)}
      >
        {busy ? "Generating" : "Generate edit"}
      </button>

      <div className="chips">
        {[
          "30s montage, fast cuts",
          "Slow cinematic pacing",
          "Tighten to 20 seconds",
        ].map((ex) => (
          <button key={ex} type="button" className="chip" onClick={() => setPrompt(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </aside>
  );
}
