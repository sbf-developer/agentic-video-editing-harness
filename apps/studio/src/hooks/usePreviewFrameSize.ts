import { useEffect, useRef, useState } from "react";

const PADDING = 16;

export interface FrameSize {
  width: number;
  height: number;
}

/** Largest axis-aligned box with `aspect` that fits inside the stage. */
export function fitAspectBox(containerW: number, containerH: number, aspect: number): FrameSize {
  if (!Number.isFinite(aspect) || aspect <= 0) return { width: 0, height: 0 };
  const w = Math.max(0, containerW - PADDING * 2);
  const h = Math.max(0, containerH - PADDING * 2);
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };

  let width = w;
  let height = width / aspect;
  if (height > h) {
    height = h;
    width = height * aspect;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

export function usePreviewFrameSize(aspect: number) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<FrameSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    function measure() {
      const node = stageRef.current;
      if (!node) return;
      const panel = node.closest(".preview-panel") as HTMLElement | null;
      const toolbar = panel?.querySelector(".preview-toolbar") as HTMLElement | null;
      const transport = panel?.querySelector(".transport") as HTMLElement | null;
      const chrome = (toolbar?.offsetHeight ?? 0) + (transport?.offsetHeight ?? 0);
      const panelW = panel?.clientWidth ?? node.clientWidth;
      const panelH = Math.max(0, (panel?.clientHeight ?? node.clientHeight) - chrome);
      const cw = Math.min(node.clientWidth, panelW);
      const ch = Math.min(node.clientHeight, panelH);
      setSize(fitAspectBox(cw, ch, aspect));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const panel = el.closest(".preview-panel");
    if (panel) ro.observe(panel);
    return () => ro.disconnect();
  }, [aspect]);

  return { stageRef, size };
}
