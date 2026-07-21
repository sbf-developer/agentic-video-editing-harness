import { useRef, useState } from "react";
import { api, uploadFiles } from "../api";
import { VideoThumb } from "./VideoThumb";
import type { MediaAsset } from "../types";

interface Props {
  assets: MediaAsset[];
  projectId: string;
  onUploaded: () => void;
  onRemoved: (plan: unknown) => void;
  onAddToTimeline: (assetId: string) => void;
  onAddAudio: (assetId: string, lane: "music" | "voiceover") => void;
  onNotify: (msg: string, type?: "ok" | "err") => void;
  busy: boolean;
}

function typeIcon(type: string): string {
  if (type === "video") return "▶";
  if (type === "audio") return "♪";
  return "◻";
}

export function AssetPanel({
  assets,
  projectId,
  onUploaded,
  onRemoved,
  onAddToTimeline,
  onAddAudio,
  onNotify,
  busy,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const locked = busy || uploading;

  async function upload(files: FileList | null) {
    if (!files?.length || locked || !projectId) return;
    setUploading(true);
    try {
      const r = await uploadFiles(projectId, files);
      onUploaded();
      onNotify(`${r.uploaded} file${r.uploaded === 1 ? "" : "s"} uploaded`);
    } catch (e) {
      onNotify(String(e), "err");
    } finally {
      setUploading(false);
    }
  }

  async function removeAsset(assetId: string) {
    if (locked || removing) return;
    if (!window.confirm(`Remove "${assetId}" from project? Clips using it will be deleted.`)) return;
    setRemoving(assetId);
    try {
      const r = await api<{ plan: unknown }>(`/api/projects/${projectId}/assets/${assetId}`, {
        method: "DELETE",
      });
      onRemoved(r.plan);
      onUploaded();
      onNotify("Asset removed");
    } catch (e) {
      onNotify(String(e), "err");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <aside className="panel asset-panel">
      <header className="panel-head">
        <h2>Media</h2>
        <span className="panel-count">{assets.length}</span>
      </header>

      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${locked ? "disabled" : ""} ${uploading ? "uploading" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!locked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => !locked && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          disabled={locked}
          onChange={(e) => upload(e.target.files).finally(() => { e.target.value = ""; })}
        />
        <span className="dropzone-title">{uploading ? "Indexing…" : "Add media"}</span>
        {!uploading && <span className="dropzone-sub">Video, audio, or image</span>}
      </div>

      <ul className="asset-list">
        {assets.length === 0 && !uploading && (
          <li className="empty-state">No media yet</li>
        )}
        {assets.map((a) => (
          <li key={a.id} className={`asset-card ${removing === a.id ? "removing" : ""}`}>
            <div className="asset-thumb">
              {a.type === "video" || a.type === "image" ? (
                <VideoThumb projectId={projectId} asset={a} className="asset-thumb-media" />
              ) : (
                <span className="asset-thumb-icon">{typeIcon(a.type)}</span>
              )}
            </div>
            <div className="asset-body">
              <span className="asset-name" title={a.id}>{a.id}</span>
              <span className="asset-meta">
                {a.type}
                {a.durationSec != null ? ` · ${a.durationSec.toFixed(1)}s` : ""}
              </span>
              <div className="asset-actions">
                {a.type === "video" && (
                  <button type="button" className="btn-text" onClick={() => onAddToTimeline(a.id)}>
                    Add
                  </button>
                )}
                {a.type === "audio" && (
                  <>
                    <button type="button" className="btn-text" onClick={() => onAddAudio(a.id, "music")}>
                      Music
                    </button>
                    <button type="button" className="btn-text" onClick={() => onAddAudio(a.id, "voiceover")}>
                      Voice
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn-text danger"
                  disabled={!!removing}
                  onClick={() => removeAsset(a.id)}
                >
                  Remove
                </button>
              </div>
            </div>
            </li>
        ))}
      </ul>
    </aside>
  );
}
