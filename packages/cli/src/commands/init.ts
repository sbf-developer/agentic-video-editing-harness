import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ASPECT_DIMENSIONS } from "@video-harness/core";

type Aspect = keyof typeof ASPECT_DIMENSIONS;

export interface InitOptions {
  projectDir: string;
  name: string;
  platform?: string;
  aspect?: Aspect;
  maxDurationSec?: number;
  assetsDir?: string;
}

function templatesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/commands → repo root/templates
  return resolve(here, "../../../../templates");
}

export function initProject(options: InitOptions): void {
  const {
    projectDir,
    name,
    platform = "tiktok",
    aspect = "9:16",
    maxDurationSec = 15,
    assetsDir = "assets",
  } = options;

  const dims = ASPECT_DIMENSIONS[aspect];
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, "transcripts"), { recursive: true });
  mkdirSync(join(projectDir, "scripts"), { recursive: true });
  mkdirSync(join(projectDir, "qa", "snapshots"), { recursive: true });
  mkdirSync(join(projectDir, "qa", "thumbs"), { recursive: true });
  mkdirSync(join(projectDir, "renders"), { recursive: true });
  mkdirSync(join(projectDir, "tmp"), { recursive: true });
  mkdirSync(join(projectDir, assetsDir), { recursive: true });

  const tpl = templatesRoot();
  let brief = readFileSync(join(tpl, "BRIEF.md"), "utf8");
  brief = brief
    .replace(/\{\{PROJECT\}\}/g, name)
    .replace(/\{\{PLATFORM\}\}/g, platform)
    .replace(/\{\{ASPECT\}\}/g, aspect)
    .replace(/\{\{MAX_DURATION\}\}/g, String(maxDurationSec));

  writeFileSync(join(projectDir, "BRIEF.md"), brief, "utf8");

  let edl = readFileSync(join(tpl, "edit-plan.json"), "utf8");
  edl = edl
    .replace(/\{\{WIDTH\}\}/g, String(dims.width))
    .replace(/\{\{HEIGHT\}\}/g, String(dims.height))
    .replace(/\{\{MAX_DURATION\}\}/g, String(maxDurationSec));

  writeFileSync(join(projectDir, "edit-plan.json"), edl, "utf8");

  writeFileSync(
    join(projectDir, "media-index.json"),
    JSON.stringify(
      {
        $schema: "video-harness/media-index/v1",
        generatedAt: new Date().toISOString(),
        assets: [],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  writeFileSync(join(projectDir, ".gitignore"), "tmp/\nrenders/*.mp4\n", "utf8");

  console.log(`✓ Project initialized: ${projectDir}`);
  console.log(`  Next: add media to ${assetsDir}/, then run: vh ingest --project ${projectDir}`);
}

export function findProjectDir(cwd: string): string {
  let dir = resolve(cwd);
  while (true) {
    if (existsSync(join(dir, "edit-plan.json")) && existsSync(join(dir, "BRIEF.md"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(cwd);
}
