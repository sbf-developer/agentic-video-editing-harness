import type { MediaAsset } from "../types";

export function mediaUrl(projectId: string, relPath: string): string {
  return `/media/${projectId}/${relPath.split("\\").join("/")}`;
}

export function assetThumbUrl(projectId: string, asset: MediaAsset): string | null {
  if (asset.thumbnail) return mediaUrl(projectId, asset.thumbnail);
  if (asset.type === "video" || asset.type === "image") return mediaUrl(projectId, asset.path);
  return null;
}

export function assetAspect(asset: MediaAsset | undefined): number {
  if (asset?.width && asset?.height) return asset.width / asset.height;
  return 16 / 9;
}

export function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(m > 0 ? 4 : 3, "0")}`;
}

export const FORMAT_PRESETS = [
  { id: "16:9", label: "16:9 Landscape", width: 1920, height: 1080 },
  { id: "9:16", label: "9:16 Vertical", width: 1080, height: 1920 },
  { id: "1:1", label: "1:1 Square", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5 Portrait", width: 1080, height: 1350 },
] as const;
