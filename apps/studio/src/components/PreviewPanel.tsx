import { useState } from "react";
import { FORMAT_PRESETS, formatTimecode } from "../lib/media";
import { SequencePlayer } from "./SequencePlayer";
import type { EditPlan, MediaAsset, VideoClip } from "../types";
import type { TimelineSegment } from "../lib/timeline";

interface Props {
  projectId: string;
  plan: EditPlan;
  assets: MediaAsset[];
  outputUrl: string | null;
  segments: TimelineSegment[];
  playhead: number;
  playing: boolean;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onPlayheadFromVideo: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onChangeTarget: (width: number, height: number) => void;
}

export function PreviewPanel({
  projectId,
  plan,
  assets,
  outputUrl,
  segments,
  playhead,
  playing,
  onSeek,
  onTogglePlay,
  onPlayheadFromVideo,
  onPlayingChange,
  onChangeTarget,
}: Props) {
  const [mode, setMode] = useState<"sequence" | "export">("sequence");
  const [formatOpen, setFormatOpen] = useState(false);

  // Program monitor always matches export canvas — source clips letterbox inside.
  const previewAspect = plan.target.width / plan.target.height;

  const formatId =
    FORMAT_PRESETS.find((p) => p.width === plan.target.width && p.height === plan.target.height)?.id ??
    "custom";

  const currentFormat =
    FORMAT_PRESETS.find((p) => p.id === formatId)?.label ?? `${plan.target.width}×${plan.target.height}`;

  const showExport = mode === "export" && outputUrl;

  return (
    <section className="preview-panel">
      <div className="preview-toolbar">
        <div className="preview-mode-tabs segmented">
          <button
            type="button"
            className={`mode-tab ${mode === "sequence" ? "active" : ""}`}
            onClick={() => setMode("sequence")}
          >
            Preview
          </button>
          {outputUrl && (
            <button
              type="button"
              className={`mode-tab ${mode === "export" ? "active" : ""}`}
              onClick={() => setMode("export")}
            >
              Export
            </button>
          )}
        </div>
        <div className="format-picker">
          <button
            type="button"
            className="format-picker-trigger"
            aria-haspopup="listbox"
            aria-expanded={formatOpen}
            onClick={() => setFormatOpen((v) => !v)}
          >
            {currentFormat}
          </button>
          {formatOpen && (
            <>
              <button
                type="button"
                className="format-picker-backdrop"
                aria-label="Close format menu"
                onClick={() => setFormatOpen(false)}
              />
              <div className="format-picker-menu" role="listbox">
                {FORMAT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={formatId === p.id}
                    className={`format-picker-item ${formatId === p.id ? "active" : ""}`}
                    onClick={() => {
                      onChangeTarget(p.width, p.height);
                      setFormatOpen(false);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="preview-dims">{plan.target.width}×{plan.target.height}</span>
      </div>

      <div
        className="preview-stage"
        style={{ "--preview-aspect": String(previewAspect) } as import("react").CSSProperties}
      >
        <div className="preview-frame">
          <div className="preview-media-slot">
            {showExport ? (
              <video key={outputUrl} src={outputUrl} controls playsInline className="preview-video" />
            ) : (
              <SequencePlayer
                projectId={projectId}
                segments={segments}
                assets={assets}
                playhead={playhead}
                playing={playing}
                onTimeUpdate={(t) => {
                  onPlayheadFromVideo(t);
                  const total = segments.at(-1);
                  if (total && t >= total.start + total.dur - 0.05) onPlayingChange(false);
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="transport">
        <button type="button" className="btn primary transport-play" onClick={onTogglePlay} title={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="transport-time">{formatTimecode(playhead)}</span>
        <input
          type="range"
          className="transport-scrubber"
          min={0}
          max={Math.max(segments.at(-1) ? segments.at(-1)!.start + segments.at(-1)!.dur : 1, 0.1)}
          step={0.05}
          value={playhead}
          onChange={(e) => {
            onPlayingChange(false);
            onSeek(parseFloat(e.target.value));
          }}
        />
        <span className="transport-time">
          {formatTimecode(segments.at(-1) ? segments.at(-1)!.start + segments.at(-1)!.dur : 0)}
        </span>
      </div>
    </section>
  );
}
