export interface ClipFrame {
  scale: number;
  x: number;
  y: number;
}

export const DEFAULT_FRAME: ClipFrame = { scale: 1, x: 0, y: 0 };

export function normalizeFrame(frame?: ClipFrame | null): ClipFrame {
  if (!frame) return { ...DEFAULT_FRAME };
  return {
    scale: Math.min(8, Math.max(0.25, frame.scale)),
    x: frame.x,
    y: frame.y,
  };
}

export function scalePanToPreview(
  frame: ClipFrame,
  previewW: number,
  previewH: number,
  targetW: number,
  targetH: number,
): { x: number; y: number; scale: number } {
  const sx = previewW / targetW;
  const sy = previewH / targetH;
  return { x: frame.x * sx, y: frame.y * sy, scale: frame.scale };
}

export function panDeltaToTarget(
  dx: number,
  dy: number,
  previewW: number,
  previewH: number,
  targetW: number,
  targetH: number,
): { dx: number; dy: number } {
  return {
    dx: dx * (targetW / previewW),
    dy: dy * (targetH / previewH),
  };
}
