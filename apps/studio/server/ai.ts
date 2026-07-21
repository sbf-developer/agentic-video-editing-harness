import {
  OverlaySchema,
  PURPOSE_TAGS,
  TransitionSchema,
  VideoClipSchema,
} from "@video-harness/core";
import { StudioEditPlanSchema, type StudioEditPlan } from "./plan.js";
import { z } from "zod";

const PURPOSE_LIST = PURPOSE_TAGS.join(" | ");

const SYSTEM = `You are a professional video editor AI for a structured edit harness. Output ONLY valid JSON — a complete edit-plan (EDL).

## Full schema

{
  "version": 1,
  "status": "draft",
  "target": { "width": 1080, "height": 1920, "fps": 30, "maxDurationSec": 60 },
  "lanes": {
    "video": [
      {
        "id": "clip-1",
        "assetId": "exact-id-from-media-index",
        "in": 0,
        "out": 5.0,
        "purpose": "hook",
        "speed": 1,
        "note": "optional editor note",
        "frame": { "scale": 1, "x": 0, "y": 0 }
      }
    ],
    "music": { "assetId": "audio-id", "startSec": 0, "gainDb": -18, "fadeInSec": 0.5, "fadeOutSec": 1 },
    "voiceover": { "assetId": "vo-id", "startSec": 0, "gainDb": 0 },
    "sfx": [{ "assetId": "sfx-id", "startSec": 2, "gainDb": -6, "purpose": "whoosh" }]
  },
  "transitions": [{ "at": "clip-1->clip-2", "type": "crossfade", "durationSec": 0.3 }],
  "overlays": [{ "at": "clip-1", "text": "Big headline", "startSec": 0.5, "endSec": 3 }],
  "captions": { "enabled": false, "style": "lower-third-bold" }
}

## Purpose tags (assign semantically)
${PURPOSE_LIST}

## Rules
- Use ONLY assetId values from mediaIndex.assets — copy IDs exactly
- Video clips: asset must be type "video". Audio lanes: type "audio"
- in/out must be within each asset's durationSec (source time, seconds)
- clip ids must be unique strings like "clip-1", "clip-hook", etc.
- transitions.at format: "prevClipId->nextClipId" for adjacent clips in video lane order
- transition types: cut | crossfade | fade. durationSec 0 for cut, 0.2–0.8 for crossfade/fade
- overlays.at = clip id. startSec/endSec = seconds within that clip on the timeline (0 = clip start)
- frame: optional per-clip reframe. scale 1 = default. Only set if user asks to zoom/pan/crop
- For "add text" / "title" / "CTA": add overlays[] entries on the relevant clips
- For "add music" / "voiceover": set lanes.music or lanes.voiceover using audio asset IDs
- For cuts / trim / reorder: modify lanes.video — keep good pacing (hooks 1–3s, broll 2–5s)
- For incremental edits ("add text to clip 2", "trim the hook"): start from currentPlan and apply the change
- For full rebuilds ("make a new 15s ad"): build a fresh timeline from assets
- Respect brief constraints (platform, max duration, tone) when provided
- Return the FULL edit-plan at top level — not wrapped in another key
- Never return empty lanes.video unless user explicitly asks to clear the timeline`;

export interface MediaAssetRef {
  id: string;
  type: string;
  path?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  tags?: string[];
  transcript?: string | null;
}

export interface MediaIndexInput {
  assets: MediaAssetRef[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiEditSummary {
  clipCount: number;
  totalSec: number;
  overlayCount: number;
  transitionCount: number;
  hasMusic: boolean;
  hasVoiceover: boolean;
  captionsEnabled: boolean;
  summary: string;
}

function clipTimelineSec(clip: z.infer<typeof VideoClipSchema>): number {
  return (clip.out - clip.in) / (clip.speed ?? 1);
}

export function summarizeEditPlan(plan: StudioEditPlan): AiEditSummary {
  const totalSec = plan.lanes.video.reduce((s, c) => s + clipTimelineSec(c), 0);
  const overlayCount = plan.overlays?.length ?? 0;
  const transitionCount = plan.transitions?.filter((t) => t.type !== "cut").length ?? 0;
  const hasMusic = !!plan.lanes.music;
  const hasVoiceover = !!plan.lanes.voiceover;
  const captionsEnabled = !!plan.captions?.enabled;

  const parts: string[] = [];
  parts.push(`${plan.lanes.video.length} clip${plan.lanes.video.length === 1 ? "" : "s"}`);
  if (totalSec > 0) parts.push(`${Math.round(totalSec)}s total`);
  if (overlayCount) parts.push(`${overlayCount} text overlay${overlayCount === 1 ? "" : "s"}`);
  if (transitionCount) parts.push(`${transitionCount} transition${transitionCount === 1 ? "" : "s"}`);
  if (hasMusic) parts.push("music");
  if (hasVoiceover) parts.push("voiceover");
  if (captionsEnabled) parts.push("captions");

  return {
    clipCount: plan.lanes.video.length,
    totalSec,
    overlayCount,
    transitionCount,
    hasMusic,
    hasVoiceover,
    captionsEnabled,
    summary: parts.join(" · "),
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]!);
    throw new Error("AI response was not valid JSON");
  }
}

function unwrapPlan(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.lanes) return obj;
  if (obj.editPlan) return obj.editPlan;
  if (obj.plan) return obj.plan;
  if (obj.edl) return obj.edl;
  return obj;
}

function repairVideoClips(
  clips: z.infer<typeof VideoClipSchema>[],
  assetMap: Map<string, MediaAssetRef>,
): z.infer<typeof VideoClipSchema>[] {
  const video: z.infer<typeof VideoClipSchema>[] = [];

  for (const clip of clips) {
    const asset = assetMap.get(clip.assetId);
    if (!asset || asset.type !== "video") continue;
    const maxOut = asset.durationSec ?? clip.out;
    let inPt = Math.max(0, clip.in);
    let outPt = Math.min(maxOut, clip.out > inPt ? clip.out : maxOut);
    if (outPt - inPt < 0.1) outPt = Math.min(maxOut, inPt + Math.min(5, maxOut - inPt));

    const purpose = PURPOSE_TAGS.includes(clip.purpose as (typeof PURPOSE_TAGS)[number])
      ? clip.purpose
      : "clip";

    const repaired: z.infer<typeof VideoClipSchema> = {
      ...clip,
      purpose,
      in: inPt,
      out: outPt,
      speed: clip.speed ?? 1,
    };

    if (clip.frame) {
      repaired.frame = {
        scale: Math.min(8, Math.max(0.25, clip.frame.scale ?? 1)),
        x: clip.frame.x ?? 0,
        y: clip.frame.y ?? 0,
      };
      if (repaired.frame.scale === 1 && repaired.frame.x === 0 && repaired.frame.y === 0) {
        delete repaired.frame;
      }
    }

    video.push(repaired);
  }

  return video;
}

function repairAudioLane(
  lane: StudioEditPlan["lanes"]["music"] | undefined,
  assetMap: Map<string, MediaAssetRef>,
  kind: "music" | "voiceover",
): StudioEditPlan["lanes"]["music"] | undefined {
  if (!lane?.assetId) return undefined;
  const asset = assetMap.get(lane.assetId);
  if (!asset || asset.type !== "audio") return undefined;
  return {
    assetId: lane.assetId,
    startSec: Math.max(0, lane.startSec ?? 0),
    gainDb: lane.gainDb ?? (kind === "music" ? -18 : 0),
    fadeInSec: lane.fadeInSec ?? 0,
    fadeOutSec: lane.fadeOutSec ?? 0,
    ...(lane.out ? { out: lane.out } : {}),
    ...(lane.duckUnderVoDb != null ? { duckUnderVoDb: lane.duckUnderVoDb } : {}),
  };
}

function repairOverlays(
  overlays: z.infer<typeof OverlaySchema>[] | undefined,
  clipIds: Set<string>,
): z.infer<typeof OverlaySchema>[] | undefined {
  if (!overlays?.length) return undefined;
  const valid = overlays
    .filter((o) => clipIds.has(o.at) && o.text.trim().length > 0 && o.endSec > o.startSec)
    .map((o) => ({
      at: o.at,
      text: o.text.trim(),
      startSec: Math.max(0, o.startSec),
      endSec: Math.max(o.startSec + 0.1, o.endSec),
    }));
  return valid.length ? valid : undefined;
}

function repairTransitions(
  transitions: z.infer<typeof TransitionSchema>[] | undefined,
  clips: z.infer<typeof VideoClipSchema>[],
): z.infer<typeof TransitionSchema>[] | undefined {
  if (!transitions?.length || clips.length < 2) return undefined;
  const valid: z.infer<typeof TransitionSchema>[] = [];
  for (let i = 1; i < clips.length; i++) {
    const key = `${clips[i - 1]!.id}->${clips[i]!.id}`;
    const found = transitions.find((t) => t.at === key);
    if (found) {
      valid.push({
        at: key,
        type: found.type ?? "cut",
        durationSec: found.type === "cut" ? 0 : Math.min(1, Math.max(0.1, found.durationSec ?? 0.3)),
      });
    }
  }
  return valid.length ? valid : undefined;
}

export function repairEditPlan(
  raw: unknown,
  currentPlan: StudioEditPlan,
  mediaIndex: MediaIndexInput,
): StudioEditPlan {
  const unwrapped = unwrapPlan(raw);
  const parsed = StudioEditPlanSchema.safeParse(unwrapped);
  const base = parsed.success ? parsed.data : currentPlan;

  const assetMap = new Map(mediaIndex.assets.map((a) => [a.id, a]));
  let video = repairVideoClips(base.lanes.video, assetMap);

  if (!video.length) {
    video = buildHeuristicPlan(currentPlan, mediaIndex).lanes.video;
  }

  const clipIds = new Set(video.map((c) => c.id));
  const music = repairAudioLane(base.lanes.music ?? currentPlan.lanes.music, assetMap, "music");
  const voiceover = repairAudioLane(
    base.lanes.voiceover ?? currentPlan.lanes.voiceover,
    assetMap,
    "voiceover",
  );

  let sfx = base.lanes.sfx ?? currentPlan.lanes.sfx;
  sfx = sfx?.filter((s) => {
    const asset = assetMap.get(s.assetId);
    return asset?.type === "audio";
  });
  if (!sfx?.length) sfx = undefined;

  const overlays = repairOverlays(base.overlays ?? currentPlan.overlays, clipIds);
  const transitions = repairTransitions(
    base.transitions ?? currentPlan.transitions,
    video,
  );

  const captions = base.captions ?? currentPlan.captions;

  const lanes = {
    video,
    ...(music ? { music } : {}),
    ...(voiceover ? { voiceover } : {}),
    ...(sfx ? { sfx } : {}),
  };

  // Explicit removal when AI sets lane to null
  const rawLanes = (unwrapped as { lanes?: Record<string, unknown> })?.lanes;
  if (rawLanes && "music" in rawLanes && rawLanes.music == null) delete lanes.music;
  if (rawLanes && "voiceover" in rawLanes && rawLanes.voiceover == null) delete lanes.voiceover;
  if (rawLanes && "sfx" in rawLanes && rawLanes.sfx == null) delete lanes.sfx;

  const parsedCaptions = captions
    ? {
        enabled: !!captions.enabled,
        style: captions.style ?? "lower-third-bold",
        ...(captions.source ? { source: captions.source } : {}),
      }
    : undefined;

  return StudioEditPlanSchema.parse({
    ...currentPlan,
    ...base,
    target: { ...currentPlan.target, ...(base.target ?? {}) },
    lanes,
    transitions,
    overlays,
    captions: parsedCaptions,
  });
}

function buildHeuristicPlan(currentPlan: StudioEditPlan, mediaIndex: MediaIndexInput): StudioEditPlan {
  const videos = mediaIndex.assets.filter((a) => a.type === "video");
  const maxTotal = currentPlan.target.maxDurationSec ?? 60;
  const clipLen = 4;
  const clips: z.infer<typeof VideoClipSchema>[] = [];
  let cursor = 0;
  let i = 0;

  while (cursor < maxTotal && videos.length) {
    const asset = videos[i % videos.length]!;
    const dur = Math.min(clipLen, asset.durationSec ?? clipLen, maxTotal - cursor);
    if (dur < 0.2) break;
    clips.push({
      id: `clip-${i + 1}`,
      assetId: asset.id,
      in: 0,
      out: dur,
      purpose: i === 0 ? "hook" : "clip",
      speed: 1,
    });
    cursor += dur;
    i++;
  }

  return {
    ...currentPlan,
    lanes: { ...currentPlan.lanes, video: clips },
    transitions: clips.length > 1
      ? clips.slice(1).map((c, idx) => ({
          at: `${clips[idx]!.id}->${c.id}`,
          type: "cut" as const,
          durationSec: 0,
        }))
      : [],
  };
}

function assetContext(assets: MediaAssetRef[]) {
  return assets.map((a) => ({
    id: a.id,
    type: a.type,
    filename: a.path?.split(/[/\\]/).pop(),
    durationSec: a.durationSec,
    width: a.width,
    height: a.height,
    tags: a.tags?.length ? a.tags : undefined,
    transcript: a.transcript ? a.transcript.slice(0, 500) : undefined,
  }));
}

export async function generateEditPlan(opts: {
  apiKey: string;
  prompt: string;
  currentPlan: StudioEditPlan;
  mediaIndex: MediaIndexInput;
  brief?: string | null;
  history?: ChatTurn[];
}): Promise<StudioEditPlan> {
  const videos = opts.mediaIndex.assets.filter((a) => a.type === "video");
  if (!videos.length) throw new Error("No video assets in project");

  const userPayload = {
    instruction: opts.prompt,
    currentPlan: opts.currentPlan,
    mediaIndex: { assets: assetContext(opts.mediaIndex.assets) },
    brief: opts.brief ?? undefined,
  };

  const messages: Array<{ role: string; content: string }> = [{ role: "system", content: SYSTEM }];

  for (const turn of opts.history?.slice(-6) ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({
    role: "user",
    content: JSON.stringify(userPayload, null, 2),
  });

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        response_format: { type: "json_object" },
        messages,
        temperature: 0.35,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API error (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from DeepSeek");

    const raw = extractJson(content);
    return repairEditPlan(raw, opts.currentPlan, opts.mediaIndex);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("401") || msg.includes("402")) throw e;
    console.warn("AI edit fallback:", msg);
    return buildHeuristicPlan(opts.currentPlan, opts.mediaIndex);
  }
}
