import type { MediaAsset, VideoClip } from "../types";

export function clipDur(c: VideoClip): number {
  return (c.out - c.in) / (c.speed ?? 1);
}

export interface TimelineSegment {
  clip: VideoClip;
  index: number;
  start: number;
  dur: number;
}

export function buildSegments(clips: VideoClip[]): TimelineSegment[] {
  let cursor = 0;
  return clips.map((clip, index) => {
    const start = cursor;
    const dur = clipDur(clip);
    cursor += dur;
    return { clip, index, start, dur };
  });
}

export function totalDuration(clips: VideoClip[]): number {
  return clips.reduce((s, c) => s + clipDur(c), 0);
}

export function locateAtTime(segments: TimelineSegment[], t: number): (TimelineSegment & { offset: number }) | null {
  for (const seg of segments) {
    if (t >= seg.start && t < seg.start + seg.dur - 1e-6) {
      return { ...seg, offset: t - seg.start };
    }
  }
  if (segments.length && t >= segments.at(-1)!.start) {
    const last = segments.at(-1)!;
    return { ...last, offset: Math.min(last.dur, t - last.start) };
  }
  return null;
}

export function sourceTimeAtOffset(seg: TimelineSegment, offset: number): number {
  return seg.clip.in + offset * (seg.clip.speed ?? 1);
}

export function splitClipAtOffset(clip: VideoClip, offset: number): [VideoClip, VideoClip] | null {
  const dur = clipDur(clip);
  if (offset <= 0.05 || offset >= dur - 0.05) return null;
  const sourceOffset = clip.in + offset * (clip.speed ?? 1);
  const first: VideoClip = { ...clip, out: sourceOffset };
  const second: VideoClip = { ...clip, id: `clip-${Date.now().toString(36)}`, in: sourceOffset };
  return [first, second];
}

export function clampTrim(
  clip: VideoClip,
  asset: MediaAsset | undefined,
  patch: { in?: number; out?: number },
): Partial<VideoClip> {
  const maxOut = asset?.durationSec ?? clip.out;
  let inPt = patch.in ?? clip.in;
  let outPt = patch.out ?? clip.out;
  inPt = Math.max(0, Math.min(inPt, maxOut - 0.1));
  outPt = Math.max(inPt + 0.1, Math.min(outPt, maxOut));
  return { in: inPt, out: outPt };
}
