import { useRef, useState } from "react";
import { VideoThumb } from "./VideoThumb";
import { clampTrim } from "../lib/timeline";
import type { MediaAsset, VideoClip } from "../types";

interface Props {
  clip: VideoClip;
  asset: MediaAsset | undefined;
  projectId: string;
  left: number;
  width: number;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<VideoClip>) => void;
  onContextAction: (action: "split" | "delete" | "duplicate") => void;
}

export function ClipBlock({
  clip,
  asset,
  projectId,
  left,
  width,
  zoom,
  selected,
  onSelect,
  onUpdate,
  onContextAction,
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ edge: "left" | "right"; startX: number; origIn: number; origOut: number } | null>(null);

  function onTrimStart(edge: "left" | "right", e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { edge, startX: e.clientX, origIn: clip.in, origOut: clip.out };

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaSec = (ev.clientX - d.startX) / zoom;
      if (d.edge === "left") {
        const trimmed = clampTrim(clip, asset, { in: d.origIn + deltaSec });
        onUpdate(trimmed);
      } else {
        const trimmed = clampTrim(clip, asset, { out: d.origOut + deltaSec });
        onUpdate(trimmed);
      }
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <>
      <div
        className={`nle-clip ${selected ? "selected" : ""}`}
        style={{ left, width: Math.max(width, 24) }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <div
          className="trim-handle left"
          onMouseDown={(e) => onTrimStart("left", e)}
          title="Drag to trim start"
        />
        {asset && (
          <VideoThumb projectId={projectId} asset={asset} className="nle-clip-thumb" atSec={clip.in} />
        )}
        <span className="nle-clip-label">{asset?.id ?? clip.assetId}</span>
        <div
          className="trim-handle right"
          onMouseDown={(e) => onTrimStart("right", e)}
          title="Drag to trim end"
        />
      </div>

      {menu && (
        <>
          <div className="ctx-backdrop" onClick={() => setMenu(null)} />
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            <button type="button" onClick={() => { onContextAction("split"); setMenu(null); }}>Cut / Split</button>
            <button type="button" onClick={() => { onContextAction("duplicate"); setMenu(null); }}>Duplicate</button>
            <button type="button" className="danger" onClick={() => { onContextAction("delete"); setMenu(null); }}>Delete</button>
          </div>
        </>
      )}
    </>
  );
}
