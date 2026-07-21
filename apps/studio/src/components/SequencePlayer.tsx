import { useEffect, useRef } from "react";
import { locateAtTime, sourceTimeAtOffset } from "../lib/timeline";
import { mediaUrl } from "../lib/media";
import type { MediaAsset, VideoClip } from "../types";
import type { TimelineSegment } from "../lib/timeline";

interface Props {
  projectId: string;
  segments: TimelineSegment[];
  assets: MediaAsset[];
  playhead: number;
  playing: boolean;
  onTimeUpdate: (t: number) => void;
  className?: string;
}

export function SequencePlayer({
  projectId,
  segments,
  assets,
  playhead,
  playing,
  onTimeUpdate,
  className = "",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const activeRef = useRef<{ clipId: string; src: string } | null>(null);

  const located = locateAtTime(segments, playhead);
  const activeClip = located?.clip ?? null;
  const activeAsset = activeClip ? assetMap.get(activeClip.assetId) : null;
  const src = activeAsset?.type === "video" ? mediaUrl(projectId, activeAsset.path) : null;
  const sourceTime = located && activeClip ? sourceTimeAtOffset(located, located.offset) : 0;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src || !activeClip) return;

    const needsLoad = activeRef.current?.src !== src;
    activeRef.current = { clipId: activeClip.id, src };

    const seek = () => {
      try {
        const t = Math.max(activeClip.in, Math.min(sourceTime, activeClip.out - 0.05));
        if (Math.abs(v.currentTime - t) > 0.15) v.currentTime = t;
      } catch {
        /* ignore */
      }
    };

    if (needsLoad) {
      v.load();
      v.addEventListener("loadedmetadata", seek, { once: true });
    } else {
      seek();
    }
  }, [src, activeClip?.id, sourceTime, activeClip?.in, activeClip?.out]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !located || !activeClip) return;

    if (playing) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playing, located, activeClip?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !located || !activeClip) return;

    const onTime = () => {
      const offset = (v.currentTime - activeClip.in) / (activeClip.speed ?? 1);
      onTimeUpdate(located.start + Math.max(0, offset));
    };

    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [located, activeClip, onTimeUpdate]);

  if (!segments.length) {
    return (
      <div className={`sequence-empty ${className}`}>
        <p>Add clips to preview</p>
      </div>
    );
  }

  if (!src) {
    return (
      <div className={`sequence-empty ${className}`}>
        <p>No video at playhead</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className={className}
      src={src}
      playsInline
      preload="auto"
      onClick={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLVideoElement).paused
          ? e.currentTarget.play()
          : e.currentTarget.pause();
      }}
    />
  );
}
