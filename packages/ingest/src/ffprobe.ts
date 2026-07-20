import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";

export interface FfprobeResult {
  durationSec: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  codec?: string;
}

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function isMediaFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext) || IMAGE_EXT.has(ext);
}

export function assetTypeFromExt(filePath: string): "video" | "audio" | "image" | null {
  const ext = extname(filePath).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export function slugifyId(name: string): string {
  return basename(name, extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function probeMedia(filePath: string): FfprobeResult | null {
  if (!existsSync(filePath)) return null;

  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=width,height,r_frame_rate,codec_type,codec_name",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) return null;

  try {
    const data = JSON.parse(result.stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        r_frame_rate?: string;
        codec_name?: string;
      }>;
    };

    const durationSec = parseFloat(data.format?.duration ?? "0");
    const videoStream = data.streams?.find((s) => s.codec_type === "video");
    const hasAudio = data.streams?.some((s) => s.codec_type === "audio") ?? false;

    let fps: number | undefined;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
      if (den) fps = num / den;
    }

    return {
      durationSec,
      width: videoStream?.width,
      height: videoStream?.height,
      fps,
      hasAudio,
      codec: videoStream?.codec_name,
    };
  } catch {
    return null;
  }
}

export interface SceneBoundary {
  startSec: number;
  endSec: number;
  score: number;
}

export function detectScenes(filePath: string, threshold = 0.3): SceneBoundary[] {
  const result = spawnSync(
    "ffmpeg",
    [
      "-i",
      filePath,
      "-filter:v",
      `select='gt(scene,${threshold})',showinfo`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );

  const output = `${result.stderr}\n${result.stdout}`;
  const ptsMatches = [...output.matchAll(/pts_time:([\d.]+)/g)].map((m) => parseFloat(m[1]!));
  const duration = probeMedia(filePath)?.durationSec ?? 0;

  if (!ptsMatches.length || !duration) return [];

  const cuts = [0, ...ptsMatches.filter((t) => t > 0 && t < duration), duration];
  const unique = [...new Set(cuts.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);

  const scenes: SceneBoundary[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    scenes.push({
      startSec: unique[i]!,
      endSec: unique[i + 1]!,
      score: threshold,
    });
  }
  return scenes;
}

export function captureThumbnail(
  filePath: string,
  outputPath: string,
  atSec?: number,
): boolean {
  const probe = probeMedia(filePath);
  const ss = atSec ?? (probe?.durationSec ? probe.durationSec * 0.25 : 0);
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-ss", String(ss), "-i", filePath, "-frames:v", "1", "-q:v", "2", outputPath],
    { encoding: "utf8" },
  );
  return result.status === 0;
}

export function toRelativePath(projectDir: string, absolutePath: string): string {
  return relative(projectDir, absolutePath).replace(/\\/g, "/");
}

export function resolveAssetPath(projectDir: string, inputPath: string): string {
  return resolve(projectDir, inputPath);
}

export { VIDEO_EXT, AUDIO_EXT, IMAGE_EXT };
