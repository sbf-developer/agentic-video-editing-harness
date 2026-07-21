import { useEffect, useMemo, useRef, useState } from "react";
import { formatTimecode } from "../lib/media";
import { SourceVideo } from "./SourceVideo";
import { VideoThumb } from "./VideoThumb";
import type { EditPlan, MediaAsset, VideoClip } from "../types";

function clipDur(c: VideoClip): number {
  return (c.out - c.in) / (c.speed ?? 1);
}

interface Props {
  plan: EditPlan;
  assets: MediaAsset[];
  projectId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (plan: EditPlan) => void;
}

const MIN_ZOOM = 24;
const MAX_ZOOM = 100;
const DEFAULT_ZOOM = 48;

export function TimelineEditor({
  plan,
  assets,
  projectId,
  selectedId,
  onSelect,
  onChange,
}: Props) {
  const clips = plan.lanes.video;
  const total = clips.reduce((s, c) => s + clipDur(c), 0);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = clips.find((c) => c.id === selectedId) ?? null;
  const selectedIndex = selected ? clips.indexOf(selected) : -1;
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const selectedAsset = selected ? assetMap.get(selected.assetId) : null;

  const timelineWidth = Math.max(total * zoom, 600);

  const segments = useMemo(() => {
    let cursor = 0;
    return clips.map((clip) => {
      const start = cursor;
      const dur = clipDur(clip);
      cursor += dur;
      return { clip, start, dur };
    });
  }, [clips]);

  const ticks = useMemo(() => {
    const step = zoom >= 60 ? 1 : zoom >= 40 ? 2 : 5;
    const arr: number[] = [];
    for (let t = 0; t <= total + step; t += step) arr.push(t);
    return arr;
  }, [total, zoom]);

  function updateClips(next: VideoClip[]) {
    onChange({ ...plan, lanes: { ...plan.lanes, video: next } });
  }

  function moveClip(index: number, dir: -1 | 1) {
    const next = [...clips];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    updateClips(next);
  }

  function updateSelected(patch: Partial<VideoClip>) {
    if (!selected) return;
    updateClips(clips.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)));
  }

  function removeSelected() {
    if (!selected) return;
    updateClips(clips.filter((c) => c.id !== selected.id));
    onSelect(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const dup: VideoClip = { ...selected, id: `clip-${Date.now().toString(36)}` };
    const next = [...clips];
    next.splice(selectedIndex + 1, 0, dup);
    updateClips(next);
    onSelect(dup.id);
  }

  function splitSelected() {
    if (!selected) return;
    const mid = (selected.in + selected.out) / 2;
    if (mid <= selected.in || mid >= selected.out) return;
    const first: VideoClip = { ...selected, out: mid };
    const second: VideoClip = { ...selected, id: `clip-${Date.now().toString(36)}`, in: mid };
    const next = [...clips];
    next.splice(selectedIndex, 1, first, second);
    updateClips(next);
    onSelect(second.id);
  }

  function useFullAsset() {
    if (!selected || !selectedAsset?.durationSec) return;
    updateSelected({ in: 0, out: selectedAsset.durationSec });
  }

  function setTransition(type: "cut" | "crossfade" | "fade") {
    if (selectedIndex <= 0 || !selected) return;
    const prev = clips[selectedIndex - 1]!;
    const key = `${prev.id}->${selected.id}`;
    const transitions = [...(plan.transitions ?? [])].filter((t) => t.at !== key);
    if (type !== "cut") {
      transitions.push({ at: key, type, durationSec: type === "crossfade" ? 0.4 : 0.3 });
    }
    onChange({ ...plan, transitions });
  }

  function currentTransition(): "cut" | "crossfade" | "fade" {
    if (selectedIndex <= 0) return "cut";
    const prev = clips[selectedIndex - 1]!;
    const key = `${prev.id}->${selected!.id}`;
    return plan.transitions?.find((t) => t.at === key)?.type ?? "cut";
  }

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
      if (e.key === "ArrowLeft" && e.altKey) {
        e.preventDefault();
        moveClip(selectedIndex, -1);
      }
      if (e.key === "ArrowRight" && e.altKey) {
        e.preventDefault();
        moveClip(selectedIndex, 1);
      }
      if (e.key === "d" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        duplicateSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, selectedIndex, clips]);

  useEffect(() => {
    if (!selected || !scrollRef.current) return;
    const seg = segments[selectedIndex];
    if (!seg) return;
    const left = seg.start * zoom;
    const el = scrollRef.current;
    if (left < el.scrollLeft || left > el.scrollLeft + el.clientWidth - 120) {
      el.scrollLeft = Math.max(0, left - 80);
    }
  }, [selectedId, selectedIndex, segments, zoom]);

  return (
    <div className="nle">
      <div className="nle-toolbar">
        <div className="nle-toolbar-left">
          <span className="nle-time">{formatTimecode(total)}</span>
          <span className="nle-meta">{clips.length} clips</span>
        </div>
        <div className="nle-toolbar-center">
          {selected ? (
            <>
              <button type="button" className="btn ghost sm" onClick={() => moveClip(selectedIndex, -1)} disabled={selectedIndex === 0}>←</button>
              <button type="button" className="btn ghost sm" onClick={() => moveClip(selectedIndex, 1)} disabled={selectedIndex === clips.length - 1}>→</button>
              <button type="button" className="btn ghost sm" onClick={splitSelected}>Split</button>
              <button type="button" className="btn ghost sm" onClick={duplicateSelected}>Dup</button>
              <button type="button" className="btn ghost sm danger" onClick={removeSelected}>Del</button>
            </>
          ) : (
            <span className="nle-hint">Select a clip to edit</span>
          )}
        </div>
        <div className="nle-toolbar-right">
          <label className="zoom-label">
            Zoom
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      {selected && (
        <div className="nle-inspector">
          <div className="nle-inspector-preview">
            {selectedAsset?.type === "video" && (
              <SourceVideo
                projectId={projectId}
                path={selectedAsset.path}
                inSec={selected.in}
                className="nle-inspector-video"
              />
            )}
          </div>
          <div className="nle-inspector-fields">
            <label className="field compact">
              <span>Source</span>
              <select value={selected.assetId} onChange={(e) => updateSelected({ assetId: e.target.value })}>
                {assets.filter((a) => a.type === "video").map((a) => (
                  <option key={a.id} value={a.id}>{a.id}</option>
                ))}
              </select>
            </label>
            <label className="field compact">
              <span>In</span>
              <input type="number" step="0.1" min={0} value={selected.in} onChange={(e) => updateSelected({ in: Math.max(0, parseFloat(e.target.value) || 0) })} />
            </label>
            <label className="field compact">
              <span>Out</span>
              <input type="number" step="0.1" min={0.1} value={selected.out} onChange={(e) => updateSelected({ out: Math.max(0.1, parseFloat(e.target.value) || 0.1) })} />
            </label>
            <label className="field compact">
              <span>Speed</span>
              <input type="number" step="0.1" min={0.1} max={4} value={selected.speed ?? 1} onChange={(e) => updateSelected({ speed: Math.max(0.1, parseFloat(e.target.value) || 1) })} />
            </label>
            {selectedIndex > 0 && (
              <label className="field compact">
                <span>Trans</span>
                <select value={currentTransition()} onChange={(e) => setTransition(e.target.value as "cut" | "crossfade" | "fade")}>
                  <option value="cut">Cut</option>
                  <option value="crossfade">Crossfade</option>
                  <option value="fade">Fade</option>
                </select>
              </label>
            )}
            <button type="button" className="btn ghost sm" onClick={useFullAsset}>Full</button>
          </div>
        </div>
      )}

      <div className="nle-body">
        <div className="nle-labels">
          <div className="nle-label nle-label-head" />
          <div className="nle-label">V1</div>
          {plan.lanes.music && <div className="nle-label">A1</div>}
          {plan.lanes.voiceover && <div className="nle-label">A2</div>}
        </div>

        <div className="nle-scroll" ref={scrollRef}>
          <div className="nle-canvas" style={{ width: timelineWidth }} onClick={() => onSelect(null)}>
            <div className="nle-ruler">
              {ticks.map((t) => (
                <div key={t} className="nle-tick" style={{ left: t * zoom }}>
                  <span>{formatTimecode(t)}</span>
                </div>
              ))}
            </div>

            <div className="nle-track">
              {segments.length === 0 ? (
                <div className="nle-track-empty">Drop clips here or add from media</div>
              ) : (
                segments.map(({ clip, start, dur }) => {
                  const asset = assetMap.get(clip.assetId);
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      className={`nle-clip ${selectedId === clip.id ? "selected" : ""}`}
                      style={{ left: start * zoom, width: Math.max(dur * zoom, 24) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(clip.id);
                      }}
                      title={asset?.id ?? clip.assetId}
                    >
                      {asset && (
                        <VideoThumb
                          projectId={projectId}
                          asset={asset}
                          className="nle-clip-thumb"
                          atSec={clip.in}
                        />
                      )}
                      <span className="nle-clip-label">{asset?.id ?? clip.assetId}</span>
                    </button>
                  );
                })
              )}
            </div>

            {plan.lanes.music && (
              <div className="nle-track audio">
                <div
                  className="nle-audio-clip"
                  style={{ left: (plan.lanes.music.startSec ?? 0) * zoom, width: Math.max(total * zoom * 0.8, 80) }}
                >
                  ♪ {plan.lanes.music.assetId}
                </div>
              </div>
            )}

            {plan.lanes.voiceover && (
              <div className="nle-track audio">
                <div
                  className="nle-audio-clip voice"
                  style={{ left: (plan.lanes.voiceover.startSec ?? 0) * zoom, width: Math.max(total * zoom * 0.6, 80) }}
                >
                  🎙 {plan.lanes.voiceover.assetId}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
