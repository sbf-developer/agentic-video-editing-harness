import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  clipDurationSec,
  computeTimelineDurationSec,
  OverlaySchema,
  type EditPlan,
} from "../schemas/edl.js";
import { getAsset, type MediaIndex } from "../schemas/media-index.js";
import type { z } from "zod";

type Overlay = z.infer<typeof OverlaySchema>;

export interface RenderScriptOptions {
  projectDir: string;
  plan: EditPlan;
  index: MediaIndex;
  outputPath?: string;
}

export interface GeneratedRender {
  shPath: string;
  ps1Path: string;
  outputRelative: string;
  commands: string[];
}

function shellQuote(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`;
}

function psQuote(path: string): string {
  return `"${path.replace(/"/g, '`"')}"`;
}

function dbToVolume(db: number): number {
  return Math.round(Math.pow(10, db / 20) * 1000) / 1000;
}

function scaleCropFilter(width: number, height: number, frame?: { scale?: number; x?: number; y?: number }): string {
  const zoom = frame?.scale ?? 1;
  const px = Math.round(frame?.x ?? 0);
  const py = Math.round(frame?.y ?? 0);
  if (zoom === 1 && px === 0 && py === 0) {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  }
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `scale=iw*${zoom}:ih*${zoom},` +
    `crop=${width}:${height}:(iw-${width})/2+${px}:(ih-${height})/2+${py},setsar=1`
  );
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

function overlayAbsTimes(plan: EditPlan, overlay: Overlay): { start: number; end: number } | null {
  let cursor = 0;
  for (const clip of plan.lanes.video) {
    const dur = clipDurationSec(clip);
    if (clip.id === overlay.at) {
      return {
        start: cursor + overlay.startSec,
        end: cursor + overlay.endSec,
      };
    }
    cursor += dur;
  }
  return null;
}

function buildOverlayFilter(plan: EditPlan, width: number, height: number): string | null {
  if (!plan.overlays?.length) return null;
  const fontSize = Math.max(28, Math.round(width * 0.045));
  const yPos = Math.round(height * 0.82);
  const parts: string[] = [];
  for (const overlay of plan.overlays) {
    const times = overlayAbsTimes(plan, overlay);
    if (!times) continue;
    const text = escapeDrawtext(overlay.text);
    parts.push(
      `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=white:` +
        `borderw=3:bordercolor=black@0.6:` +
        `x=(w-text_w)/2:y=${yPos}:` +
        `enable='between(t\\,${times.start.toFixed(3)}\\,${times.end.toFixed(3)})'`,
    );
  }
  return parts.length ? parts.join(",") : null;
}

export function generateRenderScripts(options: RenderScriptOptions): GeneratedRender {
  const { projectDir, plan, index } = options;
  const outputRelative = options.outputPath ?? "renders/output.mp4";
  const tmpDir = join(projectDir, "tmp");
  const scriptsDir = join(projectDir, "scripts");
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(dirname(join(projectDir, outputRelative)), { recursive: true });

  const { width, height, fps } = plan.target;
  const commands: string[] = [];
  const shLines = ["#!/usr/bin/env bash", "set -euo pipefail", `cd ${shellQuote(projectDir)}`, ""];
  const psLines = ["$ErrorActionPreference = 'Stop'", `Set-Location ${psQuote(projectDir)}`, ""];

  const clipOutputs: string[] = [];

  plan.lanes.video.forEach((clip, i) => {
    const asset = getAsset(index, clip.assetId);
    if (!asset) throw new Error(`Unknown asset: ${clip.assetId}`);
    const src = asset.path.replace(/\\/g, "/");
    const duration = clip.out - clip.in;
    const outClip = `tmp/clip-${String(i).padStart(2, "0")}-${clip.id}.mp4`;
    clipOutputs.push(outClip);

    let vf = scaleCropFilter(width, height, clip.frame);
    if (clip.speed !== 1) {
      vf += `,setpts=PTS/${clip.speed}`;
    }

    const cmd =
      `ffmpeg -y -ss ${clip.in} -i ${shellQuote(src)} -t ${duration} ` +
      `-vf "${vf}" -r ${fps} -an ${shellQuote(outClip)}`;

    const psCmd =
      `ffmpeg -y -ss ${clip.in} -i ${psQuote(src)} -t ${duration} ` +
      `-vf "${vf}" -r ${fps} -an ${psQuote(outClip)}`;

    shLines.push(`# ${clip.id} (${clip.purpose})`);
    shLines.push(cmd);
    shLines.push("");
    psLines.push(`# ${clip.id} (${clip.purpose})`);
    psLines.push(psCmd);
    psLines.push("");
    commands.push(cmd);
  });

  const videoOnly = "tmp/video-only.mp4";
  const concatList = "tmp/concat.txt";
  const concatEntries = clipOutputs.map((f) => f.replace(/^tmp[/\\]/, ""));
  const concatLines = concatEntries.map((f) => `file '${f}'`).join("\n");
  writeFileSync(join(projectDir, concatList), concatLines + "\n", "utf8");

  const overlayFilter = buildOverlayFilter(plan, width, height);
  let concatCmd = `ffmpeg -y -f concat -safe 0 -i ${shellQuote(concatList)} -c copy ${shellQuote(videoOnly)}`;
  if (overlayFilter) {
    concatCmd =
      `ffmpeg -y -f concat -safe 0 -i ${shellQuote(concatList)} -vf "${overlayFilter}" ` +
      `-c:v libx264 -crf 18 -an ${shellQuote(videoOnly)}`;
  }

  shLines.push(`# concat → ${concatList}`, concatCmd, "");
  psLines.push(
    `# concat → ${concatList}`,
    overlayFilter
      ? `ffmpeg -y -f concat -safe 0 -i ${psQuote(concatList)} -vf "${overlayFilter}" -c:v libx264 -crf 18 -an ${psQuote(videoOnly)}`
      : `ffmpeg -y -f concat -safe 0 -i ${psQuote(concatList)} -c copy ${psQuote(videoOnly)}`,
    "",
  );
  commands.push(concatCmd);

  const inputArgsSh: string[] = [`-i ${shellQuote(videoOnly)}`];
  const inputArgsPs: string[] = [`-i ${psQuote(videoOnly)}`];
  let inputIndex = 1;
  const filterParts: string[] = [];
  const audioLabels: string[] = [];
  const totalDur = computeTimelineDurationSec(plan);

  if (plan.lanes.music) {
    const asset = getAsset(index, plan.lanes.music.assetId);
    if (asset) {
      const src = asset.path.replace(/\\/g, "/");
      inputArgsSh.push(`-i ${shellQuote(src)}`);
      inputArgsPs.push(`-i ${psQuote(src)}`);
      const vol = dbToVolume(plan.lanes.music.gainDb);
      let chain = `[${inputIndex}:a]volume=${vol}`;
      if (plan.lanes.music.fadeInSec > 0) {
        chain += `,afade=t=in:st=0:d=${plan.lanes.music.fadeInSec}`;
      }
      if (plan.lanes.music.fadeOutSec > 0) {
        const fadeStart = Math.max(0, totalDur - plan.lanes.music.fadeOutSec);
        chain += `,afade=t=out:st=${fadeStart.toFixed(3)}:d=${plan.lanes.music.fadeOutSec}`;
      }
      chain += "[music]";
      filterParts.push(chain);
      audioLabels.push("[music]");
      inputIndex++;
    }
  }

  if (plan.lanes.voiceover) {
    const asset = getAsset(index, plan.lanes.voiceover.assetId);
    if (asset) {
      inputArgsSh.push(`-i ${shellQuote(asset.path.replace(/\\/g, "/"))}`);
      inputArgsPs.push(`-i ${psQuote(asset.path.replace(/\\/g, "/"))}`);
      const vol = dbToVolume(plan.lanes.voiceover.gainDb);
      const delayMs = Math.round(plan.lanes.voiceover.startSec * 1000);
      filterParts.push(
        `[${inputIndex}:a]volume=${vol},adelay=${delayMs}|${delayMs}[vo]`,
      );
      audioLabels.push("[vo]");
      inputIndex++;
    }
  }

  const outputPath = outputRelative.replace(/\\/g, "/");
  let finalCmd: string;
  let psFinal: string;

  if (audioLabels.length > 0) {
    filterParts.push(
      `${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=2[aout]`,
    );
    finalCmd =
      `ffmpeg -y ${inputArgsSh.join(" ")} -filter_complex "${filterParts.join(";")}" ` +
      `-map 0:v -map "[aout]" -c:v libx264 -crf 18 -c:a aac -b:a 192k -shortest ${shellQuote(outputPath)}`;
    psFinal =
      `ffmpeg -y ${inputArgsPs.join(" ")} -filter_complex "${filterParts.join(";")}" ` +
      `-map 0:v -map "[aout]" -c:v libx264 -crf 18 -c:a aac -b:a 192k -shortest ${psQuote(outputPath)}`;
  } else {
    finalCmd =
      `ffmpeg -y -i ${shellQuote(videoOnly)} -c:v libx264 -crf 18 -an ${shellQuote(outputPath)}`;
    psFinal = `ffmpeg -y -i ${psQuote(videoOnly)} -c:v libx264 -crf 18 -an ${psQuote(outputPath)}`;
  }

  shLines.push("# Final mix", finalCmd);
  psLines.push("# Final mix", psFinal);
  commands.push(finalCmd);

  if (plan.captions?.enabled && plan.captions.source) {
    const captioned = outputPath.replace(/\.mp4$/i, "-captioned.mp4");
    const subPath = plan.captions.source.replace(/\\/g, "/");
    const capCmd =
      `ffmpeg -y -i ${shellQuote(outputPath)} -vf "subtitles=${subPath}" ` +
      `-c:a copy ${shellQuote(captioned)}`;
    const capPs =
      `ffmpeg -y -i ${psQuote(outputPath)} -vf "subtitles=${subPath}" ` +
      `-c:a copy ${psQuote(captioned)}`;
    shLines.push("", "# Burn captions", capCmd);
    psLines.push("", "# Burn captions", capPs);
    commands.push(capCmd);
  }

  const shPath = join(scriptsDir, "render.sh");
  const ps1Path = join(scriptsDir, "render.ps1");
  writeFileSync(shPath, shLines.join("\n") + "\n", "utf8");
  writeFileSync(ps1Path, psLines.join("\r\n") + "\r\n", "utf8");

  return { shPath, ps1Path, outputRelative: outputPath, commands };
}

export function getSnapshotTimestamps(plan: EditPlan): Array<{ label: string; sec: number }> {
  const stamps: Array<{ label: string; sec: number }> = [{ label: "00-start", sec: 0 }];
  let cursor = 0;
  plan.lanes.video.forEach((clip, i) => {
    const dur = clipDurationSec(clip);
    stamps.push({ label: `${String(i + 1).padStart(2, "0")}-${clip.id}-start`, sec: cursor });
    stamps.push({
      label: `${String(i + 1).padStart(2, "0")}-${clip.id}-end`,
      sec: Math.max(0, cursor + dur - 0.05),
    });
    cursor += dur;
  });
  stamps.push({ label: "99-final", sec: Math.max(0, cursor - 0.1) });
  return stamps;
}
