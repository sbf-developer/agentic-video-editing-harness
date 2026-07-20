import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EditPlan } from "../schemas/edl.js";
import { getSnapshotTimestamps } from "../render/ffmpeg-generator.js";

export interface SnapshotOptions {
  projectDir: string;
  videoPath: string;
  plan: EditPlan;
  outputDir?: string;
}

export interface SnapshotResult {
  snapshots: string[];
  contactSheet: string | null;
}

function runFfmpeg(args: string[]): boolean {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  return result.status === 0;
}

export function captureSnapshots(options: SnapshotOptions): SnapshotResult {
  const outputDir = options.outputDir ?? join(options.projectDir, "qa", "snapshots");
  mkdirSync(outputDir, { recursive: true });

  if (!existsSync(options.videoPath)) {
    return { snapshots: [], contactSheet: null };
  }

  const timestamps = getSnapshotTimestamps(options.plan);
  const snapshots: string[] = [];

  for (const { label, sec } of timestamps) {
    const out = join(outputDir, `${label}.jpg`);
    const ok = runFfmpeg([
      "-y",
      "-ss",
      String(sec),
      "-i",
      options.videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      out,
    ]);
    if (ok) snapshots.push(out);
  }

  const contactSheet = join(outputDir, "contact-sheet.jpg");
  const files = readdirSync(outputDir)
    .filter((f) => f.endsWith(".jpg") && f !== "contact-sheet.jpg")
    .sort()
    .map((f) => join(outputDir, f));

  if (files.length >= 2 && files.length <= 4) {
    const layout =
      files.length === 2
        ? "[0:v][1:v]hstack=inputs=2"
        : files.length === 3
          ? "[0:v][1:v]hstack=inputs=2[t];[t][2:v]vstack=inputs=2"
          : "[0:v][1:v]hstack=inputs=2[t0];[2:v][3:v]hstack=inputs=2[t1];[t0][t1]vstack=inputs=2";
    const ok = runFfmpeg([
      "-y",
      ...files.flatMap((f) => ["-i", f]),
      "-filter_complex",
      layout,
      contactSheet,
    ]);
    if (ok) return { snapshots, contactSheet };
  }

  return { snapshots, contactSheet: files[0] ?? null };
}

export function probeDuration(videoPath: string): number | null {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  const val = parseFloat(result.stdout.trim());
  return Number.isFinite(val) ? val : null;
}

export function probeLoudness(videoPath: string): number | null {
  const result = spawnSync(
    "ffmpeg",
    ["-i", videoPath, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const match = (result.stderr || "").match(/"input_i"\s*:\s*"(-?[\d.]+)"/);
  return match ? parseFloat(match[1]) : null;
}

export function runPostRenderQa(
  videoPath: string,
  expectedDurationSec: number,
): Array<{ id: string; pass: boolean; detail: string; severity?: "error" | "warning" }> {
  const checks: Array<{ id: string; pass: boolean; detail: string; severity?: "error" | "warning" }> = [];
  const duration = probeDuration(videoPath);

  if (duration === null) {
    checks.push({ id: "output-exists", pass: false, detail: "Could not probe output video" });
    return checks;
  }

  checks.push({
    id: "output-duration",
    pass: Math.abs(duration - expectedDurationSec) <= 1.5,
    detail: `Output ${duration.toFixed(2)}s vs expected ~${expectedDurationSec.toFixed(2)}s`,
    severity: Math.abs(duration - expectedDurationSec) <= 1.5 ? "warning" : "error",
  });

  const lufs = probeLoudness(videoPath);
  if (lufs !== null) {
    checks.push({
      id: "loudness",
      pass: lufs >= -24 && lufs <= -12,
      detail: `Integrated loudness: ${lufs.toFixed(1)} LUFS`,
      severity: "warning",
    });
  }

  return checks;
}
