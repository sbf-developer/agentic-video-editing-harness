import { useCallback, useState } from "react";

export interface LayoutSizes {
  mediaW: number;
  aiW: number;
  timelineH: number;
}

const STORAGE_KEY = "studio-layout-sizes";

const DEFAULT: LayoutSizes = {
  mediaW: 220,
  aiW: 340,
  timelineH: 300,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function load(): LayoutSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<LayoutSizes>;
    return {
      mediaW: clamp(parsed.mediaW ?? DEFAULT.mediaW, 160, 480),
      aiW: clamp(parsed.aiW ?? DEFAULT.aiW, 260, 560),
      timelineH: clamp(parsed.timelineH ?? DEFAULT.timelineH, 180, 680),
    };
  } catch {
    return DEFAULT;
  }
}

function save(sizes: LayoutSizes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    /* ignore */
  }
}

export function useLayoutSizes() {
  const [sizes, setSizes] = useState<LayoutSizes>(load);

  const update = useCallback((patch: Partial<LayoutSizes>) => {
    setSizes((prev) => {
      const next: LayoutSizes = {
        mediaW: clamp(patch.mediaW ?? prev.mediaW, 160, 480),
        aiW: clamp(patch.aiW ?? prev.aiW, 260, 560),
        timelineH: clamp(patch.timelineH ?? prev.timelineH, 180, 680),
      };
      save(next);
      return next;
    });
  }, []);

  const nudgeMedia = useCallback((delta: number) => {
    setSizes((prev) => {
      const next = { ...prev, mediaW: clamp(prev.mediaW + delta, 160, 480) };
      save(next);
      return next;
    });
  }, []);

  const nudgeAi = useCallback((delta: number) => {
    setSizes((prev) => {
      const next = { ...prev, aiW: clamp(prev.aiW - delta, 260, 560) };
      save(next);
      return next;
    });
  }, []);

  const nudgeTimeline = useCallback((delta: number) => {
    setSizes((prev) => {
      const next = { ...prev, timelineH: clamp(prev.timelineH + delta, 180, 680) };
      save(next);
      return next;
    });
  }, []);

  return { sizes, update, nudgeMedia, nudgeAi, nudgeTimeline };
}
