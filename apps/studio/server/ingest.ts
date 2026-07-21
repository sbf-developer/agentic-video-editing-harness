import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildMediaIndex, type BuildIndexOptions } from "@video-harness/ingest";
import { loadMediaIndex, saveMediaIndex, type MediaIndex } from "@video-harness/core";
import { readdirSync, statSync } from "node:fs";
import { isMediaFile } from "@video-harness/ingest";

/** Fast indexing for Studio — skips slow scene detection. */
export async function indexStudioAssets(projectDir: string): Promise<MediaIndex> {
  const indexPath = join(projectDir, "media-index.json");
  const existingIndex = existsSync(indexPath) ? loadMediaIndex(indexPath) : undefined;

  const options: BuildIndexOptions = {
    projectDir,
    paths: ["assets"],
    existingIndex,
    detectSceneBoundaries: false,
    captureThumbnails: true,
  };

  const index = await buildMediaIndex(options);
  saveMediaIndex(indexPath, index);
  return index;
}

export function countMediaFilesInAssets(projectDir: string): number {
  const assetsDir = join(projectDir, "assets");
  if (!existsSync(assetsDir)) return 0;
  let count = 0;
  for (const entry of readdirSync(assetsDir)) {
    const full = join(assetsDir, entry);
    if (statSync(full).isFile() && isMediaFile(full)) count++;
  }
  return count;
}

export async function syncStudioIndexIfNeeded(projectDir: string): Promise<MediaIndex> {
  const indexPath = join(projectDir, "media-index.json");
  const onDisk = countMediaFilesInAssets(projectDir);
  if (onDisk === 0) {
    if (existsSync(indexPath)) return loadMediaIndex(indexPath);
    return { $schema: "video-harness/media-index/v1", generatedAt: new Date().toISOString(), assets: [] };
  }

  const current = existsSync(indexPath) ? loadMediaIndex(indexPath) : null;
  const indexedPaths = new Set(current?.assets.map((a) => a.path) ?? []);
  const assetsDir = join(projectDir, "assets");
  let needsSync = !current || current.assets.length < onDisk;
  if (!needsSync && existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir)) {
      const rel = `assets/${entry}`;
      if (isMediaFile(join(assetsDir, entry)) && !indexedPaths.has(rel)) {
        needsSync = true;
        break;
      }
    }
  }

  if (needsSync) return indexStudioAssets(projectDir);
  return current!;
}
