import { VideoClipSchema } from "@video-harness/core";
import { StudioEditPlanSchema, type StudioEditPlan } from "./plan.js";
import { z } from "zod";

const SYSTEM = `You are a professional video editor AI. You output ONLY valid JSON for an edit-plan (EDL).

Schema:
{
  "version": 1,
  "status": "draft",
  "target": { "width": 1080, "height": 1920, "fps": 30, "maxDurationSec": 60 },
  "lanes": {
    "video": [
      { "id": "clip-1", "assetId": "exact-id-from-media-index", "in": 0, "out": 5.0, "purpose": "clip", "speed": 1 }
    ]
  },
  "transitions": [{ "at": "clip-1->clip-2", "type": "crossfade", "durationSec": 0.3 }]
}

Rules:
- Use ONLY assetId values from mediaIndex.assets[].id — copy them exactly
- purpose must be "clip" for each video clip
- in/out must be within each asset's durationSec
- Build a NEW timeline matching the user's instruction — do not return an empty video array
- For "short" or "clean" edits: use 3-6 second clips, fast pacing
- Return the FULL edit-plan object at the top level (not wrapped in another key)`;

interface MediaAssetRef {
  id: string;
  type: string;
  durationSec?: number;
}

interface MediaIndexInput {
  assets: MediaAssetRef[];
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

export function repairEditPlan(
  raw: unknown,
  currentPlan: StudioEditPlan,
  mediaIndex: MediaIndexInput,
): StudioEditPlan {
  const unwrapped = unwrapPlan(raw);
  const parsed = StudioEditPlanSchema.safeParse(unwrapped);
  const base = parsed.success ? parsed.data : currentPlan;

  const assetMap = new Map(mediaIndex.assets.map((a) => [a.id, a]));
  const video: z.infer<typeof VideoClipSchema>[] = [];

  for (const clip of base.lanes.video) {
    const asset = assetMap.get(clip.assetId);
    if (!asset || asset.type !== "video") continue;
    const maxOut = asset.durationSec ?? clip.out;
    let inPt = Math.max(0, clip.in);
    let outPt = Math.min(maxOut, clip.out > inPt ? clip.out : maxOut);
    if (outPt - inPt < 0.1) outPt = Math.min(maxOut, inPt + Math.min(5, maxOut - inPt));
    video.push({
      ...clip,
      purpose: "clip",
      in: inPt,
      out: outPt,
      speed: clip.speed ?? 1,
    });
  }

  if (!video.length) {
    video.push(...buildHeuristicPlan(currentPlan, mediaIndex).lanes.video);
  }

  return StudioEditPlanSchema.parse({
    ...currentPlan,
    ...base,
    target: { ...currentPlan.target, ...(base.target ?? {}) },
    lanes: { ...base.lanes, video },
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
      purpose: "clip",
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

export async function generateEditPlan(opts: {
  apiKey: string;
  prompt: string;
  currentPlan: StudioEditPlan;
  mediaIndex: MediaIndexInput;
}): Promise<StudioEditPlan> {
  const videos = opts.mediaIndex.assets.filter((a) => a.type === "video");
  if (!videos.length) throw new Error("No video assets in project");

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
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: JSON.stringify(
              {
                instruction: opts.prompt,
                currentPlan: opts.currentPlan,
                mediaIndex: {
                  assets: opts.mediaIndex.assets.map((a) => ({
                    id: a.id,
                    type: a.type,
                    durationSec: a.durationSec,
                  })),
                },
              },
              null,
              2,
            ),
          },
        ],
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
