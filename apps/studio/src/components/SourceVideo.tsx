import { useEffect, useRef } from "react";
import { mediaUrl } from "../lib/media";

interface Props {
  projectId: string;
  path: string;
  inSec: number;
  className?: string;
}

/** Video player that seeks to in-point after metadata loads. */
export function SourceVideo({ projectId, path, inSec, className = "" }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const src = mediaUrl(projectId, path);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    const seek = () => {
      try {
        v.currentTime = Math.max(0, Math.min(inSec, v.duration || inSec));
      } catch {
        /* ignore */
      }
    };

    v.addEventListener("loadedmetadata", seek);
    v.addEventListener("canplay", seek);
    return () => {
      v.removeEventListener("loadedmetadata", seek);
      v.removeEventListener("canplay", seek);
    };
  }, [src, inSec]);

  return (
    <video
      ref={ref}
      key={`${src}-${inSec}`}
      className={className}
      src={src}
      controls
      playsInline
      preload="auto"
    />
  );
}
