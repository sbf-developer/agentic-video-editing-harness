import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { AssetPanel } from "./components/AssetPanel";
import { AiPanel } from "./components/AiPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { ResizeHandle } from "./components/ResizeHandle";
import { TimelineEditor } from "./components/TimelineEditor";
import { usePlayback } from "./hooks/usePlayback";
import { useLayoutSizes } from "./hooks/useLayoutSizes";
import type { ClipFrame } from "./lib/frame";
import type { AiEditSummary, EditPlan, ProjectState } from "./types";

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

  async function aiEdit(
    prompt: string,
    apiKey?: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ) {
    if (dirty) await savePlan();
    setBusy("ai");
    try {
      const r = await api<{ plan: EditPlan; summary: AiEditSummary }>(
        `/api/projects/${projectId}/ai-edit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, history, ...(apiKey ? { apiKey } : {}) }),
        },
      );
      setPlan(r.plan);
      setDirty(true);
      setSelectedClip(r.plan.lanes.video[0]?.id ?? null);
      return r.summary;
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
          { id, assetId, in: 0, out: Math.min(dur, dur), purpose: "clip", speed: 1 },
        ],
      },
    });
    setSelectedClip(id);
  }

  function addAudio(assetId: string, lane: "music" | "voiceover") {
    if (!plan) return;
    patchPlan({
      ...plan,
      lanes: {
        ...plan.lanes,
        [lane]: { assetId, startSec: 0, gainDb: lane === "music" ? -18 : 0 },
      },
    });
    notify(lane === "music" ? "Music lane added" : "Voice lane added");
  }

  function onAssetRemoved(nextPlan: unknown) {
    setPlan(nextPlan as EditPlan);
    setDirty(false);
    setSelectedClip(null);
    notify("Asset removed");
  }

  function setTargetFormat(width: number, height: number) {
    if (!plan) return;
    patchPlan({ ...plan, target: { ...plan.target, width, height } });
  }

  function updateClipFrame(clipId: string, frame: ClipFrame | undefined) {
    if (!plan) return;
    patchPlan({
      ...plan,
      lanes: {
        ...plan.lanes,
        video: plan.lanes.video.map((c) => {
          if (c.id !== clipId) return c;
          if (!frame) {
            const { frame: _removed, ...rest } = c;
            return rest;
          }
          return { ...c, frame };
        }),
      },
    });
  }

  const clips = plan?.lanes.video ?? [];
  const playback = usePlayback(clips);
  const { sizes, nudgeMedia, nudgeAi, nudgeTimeline } = useLayoutSizes();

  if (bootError) {
    return (
      <div className="screen-center error">
        <p>{bootError}</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!plan || !data) {
    return <div className="screen-center">Loading</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">Studio<span className="logo-dot">.</span></span>
          <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="header-right">
          <button type="button" className="btn ghost" onClick={newProject} disabled={!!busy}>New</button>
          {dirty && <span className="badge">Unsaved</span>}
          <button type="button" className="btn ghost" onClick={savePlan} disabled={!!busy || !dirty}>Save</button>
          <button type="button" className="btn primary" onClick={render} disabled={!!busy || !plan.lanes.video.length}>
            {busy === "render" ? "Exporting" : "Export"}
          </button>
        </div>
      </header>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div
        className="layout"
        style={{
          gridTemplateColumns: `${sizes.mediaW}px 5px minmax(0, 1fr) 5px ${sizes.aiW}px`,
        }}
      >
        <AssetPanel
          assets={data.index.assets}
          projectId={projectId}
          busy={!!busy}
          onNotify={notify}
          onUploaded={() => loadProject(projectId)}
          onRemoved={onAssetRemoved}
          onAddToTimeline={addClip}
          onAddAudio={addAudio}
        />

        <ResizeHandle axis="x" onDelta={nudgeMedia} />

        <main
          className="main"
          style={{
            gridTemplateRows: `minmax(0, 1fr) 5px ${sizes.timelineH}px`,
          }}
        >
          <PreviewPanel
            projectId={projectId}
            plan={plan}
            assets={data.index.assets}
            segments={playback.segments}
            playhead={playback.playhead}
            playing={playback.playing}
            onSeek={playback.seek}
            onTogglePlay={playback.togglePlay}
            onPlayheadFromVideo={playback.setPlayhead}
            onPlayingChange={playback.setPlaying}
            onChangeTarget={setTargetFormat}
            onUpdateClipFrame={updateClipFrame}
          />

          <ResizeHandle axis="y" onDelta={nudgeTimeline} />

          <TimelineEditor
            plan={plan}
            assets={data.index.assets}
            projectId={projectId}
            selectedId={selectedClip}
            playhead={playback.playhead}
            onSeek={playback.seek}
            onSelect={setSelectedClip}
            onChange={patchPlan}
          />
        </main>

        <ResizeHandle axis="x" onDelta={nudgeAi} />

        <AiPanel projectId={projectId} onSubmit={aiEdit} busy={busy === "ai"} />
      </div>
    </div>
  );
}
