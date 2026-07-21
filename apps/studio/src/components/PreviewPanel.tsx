import { useMemo } from "react";
import { FORMAT_PRESETS, assetAspect } from "../lib/media";
import { SourceVideo } from "./SourceVideo";
import type { EditPlan, MediaAsset, VideoClip } from "../types";

interface Props {
  projectId: string;
  plan: EditPlan;
  assets: MediaAsset[];
  outputUrl: string | null;
  selectedClip: VideoClip | null;
  onChangeTarget: (width: number, height: number) => void;
}

export function PreviewPanel({
  projectId,
  plan,
  assets,
  outputUrl,
  selectedClip,
  onChangeTarget,
}: Props) {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const selectedAsset = selectedClip ? assetMap.get(selectedClip.assetId) : null;

  const previewAspect = useMemo(() => {
    if (outputUrl) {
      return plan.target.width / plan.target.height;
    }
    if (selectedAsset) return assetAspect(selectedAsset);
    return plan.target.width / plan.target.height;
  }, [outputUrl, selectedAsset, plan.target.width, plan.target.height]);

  const formatId =
    FORMAT_PRESETS.find((p) => p.width === plan.target.width && p.height === plan.target.height)?.id ??
    "custom";

  return (
    <section className="preview-panel">
      <div className="preview-toolbar">
        <span className="preview-label">Program</span>
        <select
          className="select format-select"
          value={formatId}
          onChange={(e) => {
            const preset = FORMAT_PRESETS.find((p) => p.id === e.target.value);
            if (preset) onChangeTarget(preset.width, preset.height);
          }}
        >
          {FORMAT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
          {formatId === "custom" && (
            <option value="custom">{plan.target.width}×{plan.target.height}</option>
          )}
        </select>
        <span className="preview-dims">{plan.target.width}×{plan.target.height}</span>
      </div>

      <div
        className="preview-stage"
        style={{ "--preview-aspect": String(previewAspect) } as import("react").CSSProperties}
      >
        <div className="preview-frame">
          {outputUrl ? (
            <video key={outputUrl} src={outputUrl} controls playsInline className="preview-media" />
          ) : selectedAsset?.type === "video" && selectedClip ? (
            <SourceVideo
              projectId={projectId}
              path={selectedAsset.path}
              inSec={selectedClip.in}
              className="preview-media"
            />
          ) : (
            <div className="preview-placeholder">
              <p>No preview</p>
              <span>Select a clip or export to preview</span>
            </div>
          )}
        </div>
      </div>

      {selectedAsset?.type === "video" && !outputUrl && (
        <div className="preview-source-tag">
          Source: {selectedAsset.id}
          {selectedAsset.width && selectedAsset.height
            ? ` · ${selectedAsset.width}×${selectedAsset.height}`
            : ""}
        </div>
      )}
    </section>
  );
}
