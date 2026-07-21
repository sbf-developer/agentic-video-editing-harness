import { useCallback, useEffect, useState } from "react";
import { buildSegments, totalDuration } from "../lib/timeline";
import type { VideoClip } from "../types";

export function usePlayback(clips: VideoClip[]) {
  const segments = buildSegments(clips);
  const duration = totalDuration(clips);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  const seek = useCallback(
    (t: number) => {
      setPlayhead(Math.max(0, Math.min(t, duration || 0)));
    },
    [duration],
  );

  const togglePlay = useCallback(() => {
    if (duration <= 0) return;
    if (playhead >= duration - 0.05) setPlayhead(0);
    setPlaying((p) => !p);
  }, [duration, playhead]);

  useEffect(() => {
    if (playhead > duration) setPlayhead(Math.max(0, duration));
  }, [duration, playhead]);

  return { segments, duration, playhead, playing, seek, togglePlay, setPlaying, setPlayhead };
}

export type { TimelineSegment } from "../lib/timeline";
