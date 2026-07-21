import { useEffect, useRef, useState } from "react";
import { assetThumbUrl, mediaUrl } from "../lib/media";
import type { MediaAsset } from "../types";

interface Props {
  projectId: string;
  asset: MediaAsset;
  className?: string;
  atSec?: number;
}

export function VideoThumb({ projectId, asset, className = "", atSec = 0.5 }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const thumb = assetThumbUrl(projectId, asset);
  const videoSrc = asset.type === "video" ? mediaUrl(projectId, asset.path) : null;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoSrc) return;
    const seek = () => {
      try {
        v.currentTime = Math.min(atSec, v.duration || atSec);
      } catch {
        /* ignore seek errors before metadata */
      }
    };
    v.addEventListener("loadeddata", seek);
    v.addEventListener("loadedmetadata", seek);
    return () => {
      v.removeEventListener("loadeddata", seek);
      v.removeEventListener("loadedmetadata", seek);
    };
  }, [videoSrc, atSec]);

  if (thumb && !imgFailed && asset.type !== "audio") {
    return (
      <img
        className={className}
        src={thumb}
        alt=""
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    );
  }

  if (videoSrc) {
    return (
      <video
        ref={videoRef}
        className={className}
        src={videoSrc}
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return <span className={`thumb-fallback ${className}`}>{asset.type === "audio" ? "♪" : "◻"}</span>;
}
