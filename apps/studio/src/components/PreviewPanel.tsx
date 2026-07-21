import { useMemo, useState } from "react";
import { usePreviewFrameSize } from "../hooks/usePreviewFrameSize";
import { hasCustomFrame, PreviewReframe } from "./PreviewReframe";
import { FORMAT_PRESETS, formatTimecode } from "../lib/media";
import { activeOverlays } from "../lib/overlays";
import { locateAtTime } from "../lib/timeline";
import { normalizeFrame, type ClipFrame } from "../lib/frame";
import { SequencePlayer } from "./SequencePlayer";
import type { EditPlan, MediaAsset } from "../types";
import type { TimelineSegment } from "../lib/timeline";

interface Props {
  projectId: string;
  plan: EditPlan;
  assets: MediaAsset[];
  segments: TimelineSegment[];
  playhead: number;
  playing: boolean;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onPlayheadFromVideo: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onChangeTarget: (width: number, height: number) => void;
  onUpdateClipFrame: (clipId: string, frame: ClipFrame | undefined) => void;
}

export function PreviewPanel({
  projectId,
  plan,
  assets,
  segments,
  playhead,
  playing,
  onSeek,
  onTogglePlay,
  onPlayheadFromVideo,
  onPlayingChange,
  onChangeTarget,
  onUpdateClipFrame,
}: Props) {
  const [formatOpen, setFormatOpen] = useState(false);

  const previewAspect = plan.target.width / plan.target.height;
  const activeClip = useMemo(() => locateAtTime(segments, playhead)?.clip ?? null, [segments, playhead]);
  const activeFrame = normalizeFrame(activeClip?.frame);
  const customFrame = hasCustomFrame(activeClip?.frame);
  const visibleOverlays = useMemo(
    () => activeOverlays(plan, segments, playhead),
    [plan, segments, playhead],
  );

  const formatId =
    FORMAT_PRESETS.find((p) => p.width === plan.target.width && p.height === plan.target.height)?.id ??
    "custom";

  const currentFormat =
    FORMAT_PRESETS.find((p) => p.id === formatId)?.label ?? `${plan.target.width}×${plan.target.height}`;

  const { stageRef, size: frameSize } = usePreviewFrameSize(previewAspect);

  function setFrame(frame: ClipFrame | undefined) {
    if (!activeClip) return;
    onUpdateClipFrame(activeClip.id, frame);
  }

  const player = (fit: "contain" | "cover") => (
    <SequencePlayer
      projectId={projectId}
      segments={segments}
      assets={assets}
      playhead={playhead}
      playing={playing}
      fit={fit}
      onTimeUpdate={(t) => {
        onPlayheadFromVideo(t);
        const total = segments.at(-1);
        if (total && t >= total.start + total.dur - 0.05) onPlayingChange(false);
      }}
    />
  );

  return (
    <section className="preview-panel">
      <div className="preview-toolbar">
        <span className="preview-label">Program</span>
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
        {activeClip && customFrame && (
          <div className="preview-reframe-controls">
            <label className="preview-zoom">
              <span>Zoom</span>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.01}
                value={activeFrame.scale}
                onChange={(e) =>
                  setFrame({ ...activeFrame, scale: parseFloat(e.target.value) })
                }
              />
              <span className="preview-zoom-val">{Math.round(activeFrame.scale * 100)}%</span>
            </label>
            <button type="button" className="btn-text" onClick={() => setFrame(undefined)}>
              Reset frame
            </button>
          </div>
        )}
        <span className="preview-dims">{plan.target.width}×{plan.target.height}</span>
      </div>

      <div className="preview-stage">
        <div className="preview-stage-measure" ref={stageRef}>
          {frameSize.width > 0 && frameSize.height > 0 && (
            <div
              className="preview-frame"
              style={{ width: frameSize.width, height: frameSize.height }}
            >
              {activeClip ? (
                <PreviewReframe
                  frame={activeClip.frame}
                  targetWidth={plan.target.width}
                  targetHeight={plan.target.height}
                  previewWidth={frameSize.width}
                  previewHeight={frameSize.height}
                  onChange={setFrame}
                  onTogglePlay={onTogglePlay}
                >
                  {(fit) => player(fit)}
                </PreviewReframe>
              ) : (
                <div className="preview-media-slot">{player("contain")}</div>
              )}
              {visibleOverlays.map((o, i) => (
                <div key={`${o.at}-${i}`} className="preview-overlay-text">
                  {o.text}
                </div>
              ))}
            </div>
          )}
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
