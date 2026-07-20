import { useCallback, useEffect, useState } from "react";

interface Clip {
  id: string;
  purpose: string;
  in: number;
  out: number;
  assetId: string;
}

interface ProjectData {
  id: string;
  briefFrontmatter: { project: string; platform: string; maxDurationSec: number } | null;
  plan: { lanes: { video: Clip[] }; target: { width: number; height: number } };
  index: { assets: Array<{ id: string; path: string; durationSec?: number }> };
  validation: { pass: boolean; checks: Array<{ id: string; pass: boolean; detail: string; severity?: string }> } | null;
  outputUrl: string | null;
  snapshots: string[];
}

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export default function App() {
  const [projects, setProjects] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<ProjectData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    const { projects: list } = await api<{ projects: string[] }>("/api/projects");
    setProjects(list);
    if (!selected && list.length) setSelected(list[0]);
  }, [selected]);

  const loadProject = useCallback(async (id: string) => {
    if (!id) return;
    setError("");
    const d = await api<ProjectData>(`/api/projects/${id}`);
    setData(d);
  }, []);

  useEffect(() => {
    loadProjects().catch((e) => setError(String(e)));
  }, [loadProjects]);

  useEffect(() => {
    if (selected) loadProject(selected).catch((e) => setError(String(e)));
  }, [selected, loadProject]);

  async function run(action: "ingest" | "validate" | "render" | "snapshot") {
    if (!selected) return;
    setBusy(action);
    setError("");
    try {
      if (action === "ingest") await api(`/api/projects/${selected}/ingest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (action === "validate") await api(`/api/projects/${selected}/validate`, { method: "POST" });
      if (action === "render") await api(`/api/projects/${selected}/render`, { method: "POST" });
      if (action === "snapshot") await api(`/api/projects/${selected}/snapshot`, { method: "POST" });
      await loadProject(selected);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }

  const clips = data?.plan.lanes.video ?? [];
  const totalDur = clips.reduce((s, c) => s + (c.out - c.in), 0);

  return (
    <div className="app">
      <header className="header">
        <h1>Video Harness Studio</h1>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <div className="actions">
          <button disabled={!!busy} onClick={() => run("ingest")}>Ingest</button>
          <button disabled={!!busy} onClick={() => run("validate")}>Validate</button>
          <button disabled={!!busy} className="primary" onClick={() => run("render")}>
            {busy === "render" ? "Rendering…" : "Render"}
          </button>
          <button disabled={!!busy} onClick={() => run("snapshot")}>Snapshots</button>
        </div>
      </header>

      {error && <div className="status error" style={{ padding: "8px 20px" }}>{error}</div>}
      {busy && !error && <div className="status" style={{ padding: "8px 20px" }}>Running {busy}…</div>}

      <div className="main">
        <div className="panel">
          <div className="preview">
            {data?.outputUrl ? (
              <video key={data.outputUrl + Date.now()} src={data.outputUrl} controls autoPlay loop />
            ) : (
              <div className="preview-empty">No render yet — click Render</div>
            )}
          </div>

          <div className="timeline">
            <h2>Timeline · {totalDur.toFixed(1)}s</h2>
            <div className="clip-bar">
              {clips.map((c) => (
                <div
                  key={c.id}
                  className={`clip ${c.purpose}`}
                  style={{ flex: c.out - c.in }}
                  title={`${c.id}: ${c.assetId}`}
                >
                  {c.id}
                </div>
              ))}
            </div>
          </div>

          {data?.snapshots && data.snapshots.length > 0 && (
            <div className="section" style={{ marginTop: 24 }}>
              <h2>Contact sheet</h2>
              <div className="snapshots">
                {data.snapshots.map((s) => (
                  <img key={s} src={s + "?t=" + Date.now()} alt="snapshot" />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="panel panel-right">
          <div className="section">
            <h2>Brief</h2>
            {data?.briefFrontmatter ? (
              <div className="json-block">
                {data.briefFrontmatter.project} · {data.briefFrontmatter.platform} · max {data.briefFrontmatter.maxDurationSec}s
              </div>
            ) : (
              <div className="json-block">—</div>
            )}
          </div>

          <div className="section">
            <h2>Validation {data?.validation?.pass ? "✓" : data?.validation ? "✗" : ""}</h2>
            <ul className="checks">
              {(data?.validation?.checks ?? []).map((c) => (
                <li key={c.id}>
                  <span className={c.pass ? "pass" : c.severity === "warning" ? "warn" : "fail"}>
                    {c.pass ? "✓" : c.severity === "warning" ? "⚠" : "✗"}
                  </span>
                  {c.detail}
                </li>
              ))}
            </ul>
          </div>

          <div className="section">
            <h2>Assets ({data?.index.assets.length ?? 0})</h2>
            <ul className="checks">
              {(data?.index.assets ?? []).map((a) => (
                <li key={a.id}>
                  <span className="pass">·</span>
                  {a.id} — {a.durationSec?.toFixed(1) ?? "?"}s
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
