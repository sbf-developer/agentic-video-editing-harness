import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { MediaAsset, MediaIndex } from "@video-harness/core";
import {
  assetTypeFromExt,
  captureThumbnail,
  detectScenes,
  isMediaFile,
  probeMedia,
  slugifyId,
  toRelativePath,
} from "./ffprobe.js";

export interface BuildIndexOptions {
  projectDir: string;
  paths: string[];
  detectSceneBoundaries?: boolean;
  captureThumbnails?: boolean;
  existingIndex?: MediaIndex;
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkDir(full));
    } else if (isMediaFile(full)) {
      results.push(full);
    }
  }
  return results;
}

function uniqueId(baseId: string, used: Set<string>): string {
  if (!used.has(baseId)) {
    used.add(baseId);
    return baseId;
  }
  let i = 2;
  while (used.has(`${baseId}-${i}`)) i++;
  const id = `${baseId}-${i}`;
  used.add(id);
  return id;
}

export async function buildMediaIndex(options: BuildIndexOptions): Promise<MediaIndex> {
  const {
    projectDir,
    detectSceneBoundaries = true,
    captureThumbnails = true,
    existingIndex,
  } = options;

  const resolvedPaths = new Set<string>();
  for (const p of options.paths) {
    const abs = resolve(projectDir, p);
    if (!existsSync(abs)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkDir(abs).forEach((f) => resolvedPaths.add(f));
    } else if (isMediaFile(abs)) {
      resolvedPaths.add(abs);
    }
  }

  const usedIds = new Set(existingIndex?.assets.map((a) => a.id) ?? []);
  const assets: MediaAsset[] = [...(existingIndex?.assets ?? [])];
  const thumbDir = join(projectDir, "qa", "thumbs");
  if (captureThumbnails) mkdirSync(thumbDir, { recursive: true });

  for (const absPath of resolvedPaths) {
    const rel = toRelativePath(projectDir, absPath);
    const existing = assets.find((a) => a.path === rel);
    if (existing) continue;

    const type = assetTypeFromExt(absPath);
    if (!type) continue;

    const id = uniqueId(slugifyId(basename(absPath)), usedIds);
    const probe = probeMedia(absPath);

    if (type === "video" && probe) {
      const scenes = detectSceneBoundaries ? detectScenes(absPath) : undefined;
      let thumbnail: string | undefined;
      if (captureThumbnails) {
        const thumbRel = `qa/thumbs/${id}.jpg`;
        const thumbAbs = join(projectDir, thumbRel);
        if (captureThumbnail(absPath, thumbAbs, probe.durationSec * 0.25)) {
          thumbnail = thumbRel;
        }
      }
      assets.push({
        id,
        path: rel,
        type: "video",
        durationSec: probe.durationSec,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        hasAudio: probe.hasAudio,
        codec: probe.codec,
        scenes,
        tags: [],
        thumbnail,
        transcript: null,
      });
    } else if (type === "audio" && probe) {
      assets.push({
        id,
        path: rel,
        type: "audio",
        durationSec: probe.durationSec,
        tags: [],
      });
    } else if (type === "image") {
      assets.push({
        id,
        path: rel,
        type: "image",
        tags: [],
      });
    }
  }

  return {
    $schema: "video-harness/media-index/v1",
    generatedAt: new Date().toISOString(),
    assets,
  };
}
