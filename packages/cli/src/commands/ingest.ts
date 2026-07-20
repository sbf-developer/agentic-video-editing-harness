import { join } from "node:path";
import { saveMediaIndex } from "@video-harness/core";
import { buildMediaIndex } from "@video-harness/ingest";
import { findProjectDir } from "./init.js";

export interface IngestOptions {
  cwd: string;
  paths: string[];
  noScenes?: boolean;
  noThumbs?: boolean;
}

export async function runIngest(options: IngestOptions): Promise<void> {
  const projectDir = findProjectDir(options.cwd);
  const indexPath = join(projectDir, "media-index.json");

  const paths = options.paths.length > 0 ? options.paths : ["assets"];

  const index = await buildMediaIndex({
    projectDir,
    paths,
    detectSceneBoundaries: !options.noScenes,
    captureThumbnails: !options.noThumbs,
  });

  saveMediaIndex(indexPath, index);
  console.log(`✓ Indexed ${index.assets.length} asset(s) → ${indexPath}`);
  for (const a of index.assets) {
    console.log(`  · ${a.id} (${a.type}) — ${a.path}${a.durationSec ? `, ${a.durationSec.toFixed(1)}s` : ""}`);
  }
}
