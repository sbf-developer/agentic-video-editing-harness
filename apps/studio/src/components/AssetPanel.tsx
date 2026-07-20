import type { MediaAsset } from "../types";

interface Props {
  assets: MediaAsset[];
  projectId: string;
  onUploaded: () => void;
  onAddToTimeline: (assetId: string) => void;
  busy: boolean;
}

export function AssetPanel({ assets, projectId, onUploaded, onAddToTimeline, busy }: Props) {
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    await fetch(`/api/projects/${projectId}/upload`, { method: "POST", body: fd });
    onUploaded();
  }

  return (
    <aside className="asset-panel">
      <div className="panel-label">Media</div>

      <label className={`dropzone ${busy ? "disabled" : ""}`}>
        <input
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          disabled={busy}
          onChange={(e) => upload(e.target.files).finally(() => { e.target.value = ""; })}
        />
        <span>Drop files or click to upload</span>
      </label>

      <ul className="asset-list">
        {assets.length === 0 && <li className="asset-empty">No assets yet</li>}
        {assets.map((a) => (
          <li key={a.id} className="asset-item">
            <div className="asset-meta">
              <span className="asset-name">{a.id}</span>
              <span className="asset-dur">
                {a.type} · {a.durationSec != null ? `${a.durationSec.toFixed(1)}s` : "—"}
              </span>
            </div>
            {a.type === "video" && (
              <button type="button" className="ghost sm" onClick={() => onAddToTimeline(a.id)}>
                + Track
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
