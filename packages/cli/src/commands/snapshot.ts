import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  captureSnapshots,
  loadEditPlan,
  saveValidationResult,
  type ValidationResult,
} from "@video-harness/core";
import { readFileSync } from "node:fs";
import { findProjectDir } from "./init.js";

export interface SnapshotOptions {
  cwd: string;
  video?: string;
}

export function runSnapshot(options: SnapshotOptions): void {
  const projectDir = findProjectDir(options.cwd);
  const plan = loadEditPlan(join(projectDir, "edit-plan.json"));
  const videoPath = resolve(
    projectDir,
    options.video ?? "renders/output.mp4",
  );

  if (!existsSync(videoPath)) {
    console.error(`Video not found: ${videoPath}`);
    console.error("Run render first: vh render --execute");
    process.exit(1);
  }

  const result = captureSnapshots({ projectDir, videoPath, plan });
  const qaPath = join(projectDir, "qa", "validation.json");
  let prior: ValidationResult | null = null;
  if (existsSync(qaPath)) {
    prior = JSON.parse(readFileSync(qaPath, "utf8")) as ValidationResult;
  }

  const merged: ValidationResult = {
    timestamp: new Date().toISOString(),
    planVersion: plan.version,
    pass: prior?.pass ?? true,
    checks: prior?.checks ?? [],
    errors: prior?.errors ?? [],
    snapshots: result.snapshots.map((s) => s.replace(projectDir + "/", "").replace(/\\/g, "/")),
  };
  if (result.contactSheet) {
    merged.snapshots!.push(
      result.contactSheet.replace(projectDir + "/", "").replace(/\\/g, "/"),
    );
  }

  saveValidationResult(qaPath, merged);

  console.log(`✓ Captured ${result.snapshots.length} snapshot(s)`);
  for (const s of result.snapshots) {
    console.log(`  · ${s}`);
  }
  if (result.contactSheet) {
    console.log(`  · contact sheet: ${result.contactSheet}`);
  }
}
