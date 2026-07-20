import type { EditPlan, MediaAsset, VideoClip } from "../types";

function clipDur(c: VideoClip): number {
  return (c.out - c.in) / (c.speed ?? 1);
}

interface Props {
  plan: EditPlan;
  assets: MediaAsset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (plan: EditPlan) => void;
}

export function TimelineEditor({ plan, assets, selectedId, onSelect, onChange }: Props) {
  const clips = plan.lanes.video;
  const total = clips.reduce((s, c) => s + clipDur(c), 0);
  const selected = clips.find((c) => c.id === selectedId) ?? null;
  const assetMap = new Map(assets.map((a) => [a.id, a]));

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

  let cursor = 0;
  const segments = clips.map((c) => {
    const start = cursor;
    const dur = clipDur(c);
    cursor += dur;
    return { clip: c, start, dur };
  });

  return (
    <div className="timeline-editor">
      <div className="timeline-head">
        <span className="timeline-time">{total.toFixed(1)}s</span>
        {plan.lanes.music && <span className="lane-tag">♪ music</span>}
        {plan.lanes.voiceover && <span className="lane-tag">🎙 voice</span>}
      </div>

      <div className="timeline-track" onClick={() => onSelect(null)}>
        {segments.length === 0 ? (
          <div className="track-empty">Add clips from media or ask AI</div>
        ) : (
          segments.map(({ clip, dur }, i) => (
            <button
              key={clip.id}
              type="button"
              className={`track-clip ${selectedId === clip.id ? "selected" : ""}`}
              style={{ flex: Math.max(dur, 0.3) }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(clip.id);
              }}
              title={assetMap.get(clip.assetId)?.path ?? clip.assetId}
            >
              <span className="clip-label">{clip.id}</span>
            </button>
          ))
        )}
      </div>

      {selected && (
        <div className="clip-inspector">
          <div className="inspector-row">
            <label>Source</label>
            <select
              value={selected.assetId}
              onChange={(e) => updateSelected({ assetId: e.target.value })}
            >
              {assets.filter((a) => a.type === "video").map((a) => (
                <option key={a.id} value={a.id}>{a.id}</option>
              ))}
            </select>
          </div>
          <div className="inspector-grid">
            <div>
              <label>In (s)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                value={selected.in}
                onChange={(e) => updateSelected({ in: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label>Out (s)</label>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={selected.out}
                onChange={(e) => updateSelected({ out: parseFloat(e.target.value) || 0.1 })}
              />
            </div>
            <div>
              <label>Speed</label>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={selected.speed ?? 1}
                onChange={(e) => updateSelected({ speed: parseFloat(e.target.value) || 1 })}
              />
            </div>
          </div>
          <div className="inspector-actions">
            <button type="button" className="ghost sm" onClick={() => moveClip(clips.indexOf(selected), -1)}>←</button>
            <button type="button" className="ghost sm" onClick={() => moveClip(clips.indexOf(selected), 1)}>→</button>
            <button type="button" className="ghost sm danger" onClick={removeSelected}>Delete</button>
          </div>
        </div>
      )}

      {(plan.lanes.music || plan.lanes.voiceover) && (
        <div className="audio-inspector">
          {plan.lanes.music && (
            <div className="inspector-row">
              <label>Music gain (dB)</label>
              <input
                type="number"
                value={plan.lanes.music.gainDb ?? -18}
                onChange={(e) =>
                  onChange({
                    ...plan,
                    lanes: {
                      ...plan.lanes,
                      music: { ...plan.lanes.music!, gainDb: parseFloat(e.target.value) },
                    },
                  })
                }
              />
            </div>
          )}
          {plan.lanes.voiceover && (
            <div className="inspector-row">
              <label>Voice start (s)</label>
              <input
                type="number"
                step="0.1"
                value={plan.lanes.voiceover.startSec ?? 0}
                onChange={(e) =>
                  onChange({
                    ...plan,
                    lanes: {
                      ...plan.lanes,
                      voiceover: { ...plan.lanes.voiceover!, startSec: parseFloat(e.target.value) || 0 },
                    },
                  })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
