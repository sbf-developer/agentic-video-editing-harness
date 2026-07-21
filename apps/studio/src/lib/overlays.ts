import type { EditPlan, Overlay } from "../types";
import type { TimelineSegment } from "./timeline";

export function activeOverlays(
  plan: EditPlan,
  segments: TimelineSegment[],
  playhead: number,
): Overlay[] {
  if (!plan.overlays?.length) return [];
  const visible: Overlay[] = [];

  for (const overlay of plan.overlays) {
    const seg = segments.find((s) => s.clip.id === overlay.at);
    if (!seg) continue;
    const localT = playhead - seg.start;
    if (localT >= overlay.startSec && localT < overlay.endSec) {
      visible.push(overlay);
    }
  }

  return visible;
}
