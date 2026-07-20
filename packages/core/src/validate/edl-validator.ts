import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SOCIAL_PLATFORMS } from "../schemas/brief.js";
import {
  clipDurationSec,
  computeTimelineDurationSec,
  type EditPlan,
} from "../schemas/edl.js";
import { getAsset, type MediaIndex } from "../schemas/media-index.js";
import type { ValidationCheck } from "../schemas/validation-result.js";
import type { ParsedBrief } from "./brief-validator.js";

export interface ValidateEdlOptions {
  projectDir: string;
  plan: EditPlan;
  index: MediaIndex;
  brief?: ParsedBrief;
  requireApprovedPlan?: boolean;
}

export interface EdlValidationOutput {
  checks: ValidationCheck[];
  errors: Array<{ check: string; message: string; suggestion?: string }>;
  pass: boolean;
  timelineDurationSec: number;
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function validateEdl(options: ValidateEdlOptions): EdlValidationOutput {
  const { projectDir, plan, index, brief, requireApprovedPlan = false } = options;
  const checks: ValidationCheck[] = [];
  const errors: EdlValidationOutput["errors"] = [];
  const resolvePath = (p: string) => resolve(projectDir, p);

  if (requireApprovedPlan) {
    const approved = plan.status === "approved";
    checks.push({
      id: "plan-status",
      pass: approved,
      detail: approved ? "Plan approved" : `Plan status is "${plan.status}"`,
    });
    if (!approved) {
      errors.push({
        check: "plan-status",
        message: "Edit plan must be approved before render",
        suggestion: 'Set status to "approved" in edit-plan.json after review',
      });
    }
  }

  for (const clip of plan.lanes.video) {
    if (clip.out <= clip.in) {
      checks.push({
        id: `clip-duration-${clip.id}`,
        pass: false,
        detail: `${clip.id}: out (${clip.out}) must be > in (${clip.in})`,
      });
      errors.push({
        check: "clip-duration-valid",
        message: `${clip.id}: invalid in/out range`,
        suggestion: `Ensure out > in for clip "${clip.id}"`,
      });
    } else {
      checks.push({
        id: `clip-duration-${clip.id}`,
        pass: true,
        detail: `${clip.id}: ${(clip.out - clip.in).toFixed(2)}s source span`,
      });
    }

    if (!clip.purpose) {
      checks.push({
        id: `purpose-${clip.id}`,
        pass: false,
        detail: `${clip.id}: missing purpose tag`,
      });
      errors.push({
        check: "purpose-required",
        message: `Clip "${clip.id}" has no purpose tag`,
        suggestion: "Add purpose: hook | problem | solution | proof | broll | cta",
      });
    }

    const asset = getAsset(index, clip.assetId);
    if (!asset) {
      checks.push({
        id: `asset-${clip.id}`,
        pass: false,
        detail: `${clip.id}: unknown assetId "${clip.assetId}"`,
      });
      errors.push({
        check: "paths-exist",
        message: `Unknown assetId "${clip.assetId}" for clip "${clip.id}"`,
        suggestion: "Run ingest or add asset to media-index.json",
      });
      continue;
    }

    const filePath = resolvePath(asset.path);
    const fileExists = existsSync(filePath);
    checks.push({
      id: `path-${clip.id}`,
      pass: fileExists,
      detail: fileExists ? `${clip.id}: ${asset.path}` : `${clip.id}: missing ${asset.path}`,
    });
    if (!fileExists) {
      errors.push({
        check: "paths-exist",
        message: `Missing file for "${clip.assetId}": ${asset.path}`,
        suggestion: "Add the file or update the asset path in media-index.json",
      });
    }

    if (asset.type === "video" && asset.durationSec !== undefined && clip.out > asset.durationSec) {
      checks.push({
        id: `bounds-${clip.id}`,
        pass: false,
        detail: `${clip.id}: out ${clip.out}s exceeds source ${asset.durationSec}s`,
      });
      errors.push({
        check: "source-in-bounds",
        message: `${clip.id}.out (${clip.out}) exceeds ${clip.assetId} duration (${asset.durationSec}s)`,
        suggestion: `Set out to ≤ ${asset.durationSec} or pick a different in-point`,
      });
    }
  }

  const timelineDurationSec = computeTimelineDurationSec(plan);
  const maxDuration = brief?.frontmatter.maxDurationSec ?? plan.target.maxDurationSec;
  const withinCap = timelineDurationSec <= maxDuration + 0.05;
  checks.push({
    id: "duration-cap",
    pass: withinCap,
    detail: `${timelineDurationSec.toFixed(2)}s / ${maxDuration}s cap`,
  });
  if (!withinCap) {
    errors.push({
      check: "duration-cap",
      message: `Timeline ${timelineDurationSec.toFixed(2)}s exceeds cap ${maxDuration}s`,
      suggestion: "Trim clips or increase maxDurationSec in BRIEF.md",
    });
  }

  const hookClip = plan.lanes.video.find((c) => c.purpose === "hook");
  if (hookClip && brief && SOCIAL_PLATFORMS.has(brief.frontmatter.platform.toLowerCase())) {
    const hookEnd = clipDurationSec(hookClip);
    const hookOk = hookEnd <= 2.0 + 0.05;
    checks.push({
      id: "hook-timing",
      pass: hookOk,
      detail: `Hook ends at ${hookEnd.toFixed(2)}s (social cap: 2.0s)`,
      severity: hookOk ? "warning" : "error",
    });
    if (!hookOk) {
      errors.push({
        check: "hook-timing",
        message: `Hook ends at ${hookEnd.toFixed(2)}s — must land by 2.0s for ${brief.frontmatter.platform}`,
        suggestion: "Trim hook clip or increase speed",
      });
    }
  }

  const hasVo = Boolean(plan.lanes.voiceover);
  const hasMusic = Boolean(plan.lanes.music);
  if (hasVo && hasMusic && plan.lanes.music) {
    const musicGain = plan.lanes.music.gainDb;
    const voGain = plan.lanes.voiceover!.gainDb;
    const musicQuietEnough = musicGain <= -12;
    checks.push({
      id: "music-ducking",
      pass: musicQuietEnough,
      detail: `Music ${musicGain} dB, VO ${voGain} dB`,
      severity: musicQuietEnough ? "warning" : "error",
    });
    if (!musicQuietEnough) {
      errors.push({
        check: "music-ducking",
        message: `Music gain (${musicGain} dB) should be ≤ -12 dB when voiceover is present`,
        suggestion: "Set music.gainDb to -18 and duckUnderVoDb to -12",
      });
    }

    const voLinear = dbToLinear(voGain);
    const musicLinear = dbToLinear(musicGain);
    const intelligible = voLinear >= musicLinear * 2;
    checks.push({
      id: "vo-intelligibility",
      pass: intelligible,
      detail: intelligible ? "VO louder than music" : "VO may be drowned by music",
      severity: intelligible ? "warning" : "error",
    });
  }

  if (plan.captions?.enabled && plan.captions.source) {
    const captionPath = resolvePath(plan.captions.source);
    const captionsExist = existsSync(captionPath);
    checks.push({
      id: "captions-source",
      pass: captionsExist,
      detail: captionsExist
        ? `Captions: ${plan.captions.source}`
        : `Missing captions file: ${plan.captions.source}`,
    });
    if (!captionsExist) {
      errors.push({
        check: "captions-source",
        message: `Caption source not found: ${plan.captions.source}`,
        suggestion: "Add SRT file or disable captions",
      });
    }
  }

  for (const lane of [plan.lanes.voiceover, plan.lanes.music].filter(Boolean)) {
    const asset = getAsset(index, lane!.assetId);
    if (!asset) continue;
    const filePath = resolvePath(asset.path);
    if (!existsSync(filePath)) {
      checks.push({
        id: `audio-path-${lane!.assetId}`,
        pass: false,
        detail: `Missing audio: ${asset.path}`,
      });
      errors.push({
        check: "paths-exist",
        message: `Missing audio file: ${asset.path}`,
      });
    }
  }

  const pass = errors.length === 0;
  return { checks, errors, pass, timelineDurationSec };
}

export function buildRepairContext(output: EdlValidationOutput): object {
  return {
    repair: true,
    pass: output.pass,
    errors: output.errors,
    checks: output.checks.filter((c) => !c.pass),
  };
}
