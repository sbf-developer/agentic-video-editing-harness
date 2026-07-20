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
    <aside className="ai-panel">
      <div className="panel-label">AI Editor</div>
      <p className="ai-hint">Describe the edit. AI builds the timeline from your uploaded assets.</p>

      {serverKeyConfigured === true && (
        <p className="ai-key-status">DeepSeek key loaded from server (.env)</p>
      )}
      {serverKeyConfigured === false && (
        <>
          <label className="field-label">DeepSeek API key</label>
          <input
            type="password"
            className="text-input"
            placeholder="sk-... (or set DEEPSEEK_API_KEY in apps/studio/.env)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </>
      )}

      <label className="field-label">Prompt</label>
      <textarea
        className="prompt-input"
        rows={5}
        placeholder="e.g. 15s vertical cut — open with the lake shot, add voiceover, fade music under speech, end on product clip"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <button
        type="button"
        className="primary full"
        disabled={busy || !canSubmit}
        onClick={() => onSubmit(prompt, serverKeyConfigured ? undefined : apiKey)}
      >
        {busy ? "Editing…" : "Generate edit"}
      </button>

      <div className="ai-examples">
        <span>Try:</span>
        {[
          "30s montage, fastest cuts on beat",
          "Slow cinematic pacing, crossfades",
          "Remove silence gaps, tighten to 20s",
        ].map((ex) => (
          <button key={ex} type="button" className="chip" onClick={() => setPrompt(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </aside>
  );
}
