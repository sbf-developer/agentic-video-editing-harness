import { useEffect, useRef, useState } from "react";

const PADDING = 16;

export interface FrameSize {
  width: number;
  height: number;
}

/** Largest axis-aligned box with `aspect` that fits inside the stage. */
export function fitAspectBox(containerW: number, containerH: number, aspect: number): FrameSize {
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
      setSize(fitAspectBox(el.clientWidth, el.clientHeight, aspect));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  return { stageRef, size };
}
