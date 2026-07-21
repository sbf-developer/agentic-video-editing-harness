import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { AssetPanel } from "./components/AssetPanel";
import { AiPanel } from "./components/AiPanel";
import { TimelineEditor } from "./components/TimelineEditor";
import type { EditPlan, ProjectState } from "./types";

export default function App() {
  const [projects, setProjects] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<ProjectState | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const notify = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadProjects = useCallback(async () => {
    const { projects: list } = await api<{ projects: string[] }>("/api/projects");
    setProjects(list);
    return list;
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const d = await api<ProjectState>(`/api/projects/${id}`);
    setData(d);
    setPlan(d.plan);
    setDirty(false);
    setSelectedClip(null);
  }, []);

  useEffect(() => {
    setBootError(null);
    loadProjects()
      .then(async (list) => {
        if (list.length) {
          setProjectId(list[0]!);
        } else {
          const { id } = await api<{ id: string }>("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Untitled" }),
          });
          await loadProjects();
          setProjectId(id);
        }
      })
      .catch((e) => setBootError(String(e)));
  }, [loadProjects]);

  useEffect(() => {
    if (!projectId) return;
    loadProject(projectId).catch((e) => setBootError(String(e)));
  }, [projectId, loadProject]);

  function patchPlan(next: EditPlan) {
    setPlan(next);
    setDirty(true);
  }

  async function savePlan() {
    if (!projectId || !plan) return;
    setBusy("save");
    try {
      await api(`/api/projects/${projectId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      setDirty(false);
      notify("Saved");
    } catch (e) {
      notify(String(e), "err");
    } finally {
      setBusy("");
    }
  }

  async function newProject() {
    const name = window.prompt("Project name", "Untitled");
    if (!name) return;
    setBusy("new");
    try {
      const { id } = await api<{ id: string }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await loadProjects();
      setProjectId(id);
    } catch (e) {
      notify(String(e), "err");
    } finally {
      setBusy("");
    }
  }

  async function render() {
    if (dirty) await savePlan();
    setBusy("render");
    try {
      const r = await api<{ outputUrl: string }>(`/api/projects/${projectId}/render`, { method: "POST" });
      await loadProject(projectId);
      notify("Export ready");
      if (r.outputUrl) setData((d) => (d ? { ...d, outputUrl: r.outputUrl } : d));
    } catch (e) {
      notify(String(e), "err");
    } finally {
      setBusy("");
    }
  }

  async function aiEdit(prompt: string, apiKey?: string) {
    if (dirty) await savePlan();
    setBusy("ai");
    try {
      const r = await api<{ plan: EditPlan }>(`/api/projects/${projectId}/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ...(apiKey ? { apiKey } : {}) }),
      });
      setPlan(r.plan);
      setDirty(true);
      notify("AI updated timeline");
    } catch (e) {
      notify(String(e), "err");
    } finally {
      setBusy("");
    }
  }

  function addClip(assetId: string) {
    if (!plan || !data) return;
    const asset = data.index.assets.find((a) => a.id === assetId);
    const dur = asset?.durationSec ?? 5;
    const id = `clip-${Date.now().toString(36)}`;
    patchPlan({
      ...plan,
      lanes: {
        ...plan.lanes,
        video: [
          ...plan.lanes.video,
          { id, assetId, in: 0, out: Math.min(dur, 5), purpose: "clip", speed: 1 },
        ],
      },
    });
    setSelectedClip(id);
  }

  if (bootError) {
    return (
      <div className="loading error">
        <p>{bootError}</p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!plan || !data) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">Studio</div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button type="button" className="ghost" onClick={newProject} disabled={!!busy}>New</button>
        <div className="spacer" />
        {dirty && <span className="unsaved">Unsaved</span>}
        <button type="button" className="ghost" onClick={savePlan} disabled={!!busy || !dirty}>Save</button>
        <button type="button" className="primary" onClick={render} disabled={!!busy}>
          {busy === "render" ? "Exporting…" : "Export"}
        </button>
      </header>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="workspace">
        <AssetPanel
          assets={data.index.assets}
          projectId={projectId}
          busy={!!busy}
          onUploaded={() => loadProject(projectId)}
          onAddToTimeline={addClip}
        />

        <main className="center">
          <div className="preview-wrap">
            {data.outputUrl ? (
              <video key={data.outputUrl} src={data.outputUrl} controls className="preview-video" />
            ) : (
              <div className="preview-placeholder">
                <span>Preview</span>
                <small>Export to preview</small>
              </div>
            )}
          </div>
          <TimelineEditor
            plan={plan}
            assets={data.index.assets}
            selectedId={selectedClip}
            onSelect={setSelectedClip}
            onChange={patchPlan}
          />
        </main>

        <AiPanel onSubmit={aiEdit} busy={busy === "ai"} />
      </div>
    </div>
  );
}
