import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ASPECT_DIMENSIONS } from "@video-harness/core";

export function scaffoldProject(projectsDir: string, name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";

  const dir = join(projectsDir, id);
  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, "renders"), { recursive: true });
  mkdirSync(join(dir, "qa"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });

  const dims = ASPECT_DIMENSIONS["9:16"];

  writeFileSync(
    join(dir, "BRIEF.md"),
    `---
project: ${id}
status: draft
route: assembly
platform: general
aspect: "9:16"
maxDurationSec: 60
flow: automation
---

## Goal

${name}

`,
    "utf8",
  );

  writeFileSync(
    join(dir, "edit-plan.json"),
    JSON.stringify(
      {
        $schema: "video-harness/edl/v1",
        version: 1,
        status: "draft",
        target: { width: dims.width, height: dims.height, fps: 30, maxDurationSec: 60 },
        lanes: { video: [] },
        transitions: [],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  writeFileSync(
    join(dir, "media-index.json"),
    JSON.stringify(
      { $schema: "video-harness/media-index/v1", generatedAt: new Date().toISOString(), assets: [] },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  writeFileSync(join(dir, ".gitignore"), "tmp/\nrenders/\nscripts/\n", "utf8");

  return id;
}

export const EMPTY_PLAN = {
  version: 1,
  status: "draft" as const,
  target: { width: 1080, height: 1920, fps: 30, maxDurationSec: 60 },
  lanes: { video: [] as unknown[] },
  transitions: [] as unknown[],
};
