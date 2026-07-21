import { useCallback, useRef, useState, type ReactNode } from "react";
import type { ClipFrame } from "../lib/frame";
import {
  DEFAULT_FRAME,
  normalizeFrame,
  panDeltaToTarget,
  scalePanToPreview,
} from "../lib/frame";

interface Props {
  frame: ClipFrame | undefined;
  targetWidth: number;
  targetHeight: number;
  previewWidth: number;
  previewHeight: number;
  onChange: (frame: ClipFrame | undefined) => void;
  onTogglePlay: () => void;
  children: (fit: "contain" | "cover") => ReactNode;
}

export function hasCustomFrame(frame?: ClipFrame | null): boolean {
  if (!frame) return false;
  return frame.scale !== DEFAULT_FRAME.scale || frame.x !== 0 || frame.y !== 0;
}

export function PreviewReframe({
  frame,
  targetWidth,
  targetHeight,
  previewWidth,
  previewHeight,
  onChange,
  onTogglePlay,
  children,
}: Props) {
  const custom = hasCustomFrame(frame);
  const normalized = normalizeFrame(frame);
  const visual = custom
    ? scalePanToPreview(normalized, previewWidth, previewHeight, targetWidth, targetHeight)
    : { x: 0, y: 0, scale: 1 };
  const dragRef = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const patch = useCallback(
    (next: ClipFrame) => {
      const n = normalizeFrame(next);
      if (n.scale === DEFAULT_FRAME.scale && n.x === 0 && n.y === 0) {
        onChange(undefined);
      } else {
        onChange(n);
      }
    },
    [onChange],
  );

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    const base = normalizeFrame(frame);
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    patch({ ...base, scale: base.scale + delta });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const base = normalizeFrame(frame);
    dragRef.current = { x: e.clientX, y: e.clientY, fx: base.x, fy: base.y };
    movedRef.current = false;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
    const delta = panDeltaToTarget(dx, dy, previewWidth, previewHeight, targetWidth, targetHeight);
    patch({
      scale: normalized.scale,
      x: d.fx + delta.dx,
      y: d.fy + delta.dy,
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!movedRef.current) onTogglePlay();
  }

  return (
    <div
      className={`preview-reframe${dragging ? " dragging" : ""}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Drag to reposition · scroll to zoom"
    >
      {custom ? (
        <div
          className="preview-transform"
          style={{ transform: `translate(${visual.x}px, ${visual.y}px) scale(${visual.scale})` }}
        >
          {children("cover")}
        </div>
      ) : (
        <div className="preview-media-slot">{children("contain")}</div>
      )}
    </div>
  );
}

export function isDefaultFrame(frame?: ClipFrame | null): boolean {
  return !hasCustomFrame(frame);
}
