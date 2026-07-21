import { z } from "zod";
import { PURPOSE_TAGS } from "./brief.js";

export const PurposeTagSchema = z.enum(PURPOSE_TAGS);

export const TransitionSchema = z.object({
  at: z.string().min(1),
  type: z.enum(["cut", "crossfade", "fade"]).default("cut"),
  durationSec: z.number().nonnegative().default(0),
});

export const ClipFrameSchema = z.object({
  /** 1 = default cover fit; >1 zooms in. */
  scale: z.number().min(0.25).max(8).default(1),
  /** Pan in output pixels (+right, +down). */
  x: z.number().default(0),
  y: z.number().default(0),
});

export const VideoClipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  in: z.number().nonnegative(),
  out: z.number().positive(),
  purpose: PurposeTagSchema,
  speed: z.number().positive().default(1),
  note: z.string().optional(),
  frame: ClipFrameSchema.optional(),
});

export const AudioLaneSchema = z.object({
  assetId: z.string().min(1),
  startSec: z.number().nonnegative().default(0),
  out: z.number().positive().optional(),
  gainDb: z.number().default(0),
  duckUnderVoDb: z.number().optional(),
  fadeInSec: z.number().nonnegative().default(0),
  fadeOutSec: z.number().nonnegative().default(0),
});

export const SfxLaneSchema = AudioLaneSchema.extend({
  purpose: z.string().optional(),
});

export const CaptionsSchema = z.object({
  enabled: z.boolean().default(false),
  source: z.string().optional(),
  style: z.string().default("lower-third-bold"),
});

export const OverlaySchema = z.object({
  at: z.string().min(1),
  text: z.string().min(1),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
});

export const TargetSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive().default(30),
  maxDurationSec: z.number().positive(),
});

export const EditPlanSchema = z.object({
  $schema: z.string().optional(),
  version: z.number().int().positive().default(1),
  status: z.enum(["draft", "review", "approved"]).default("draft"),
  target: TargetSchema,
  lanes: z.object({
    video: z.array(VideoClipSchema).min(1),
    voiceover: AudioLaneSchema.optional(),
    music: AudioLaneSchema.optional(),
    sfx: z.array(SfxLaneSchema).optional(),
  }),
  transitions: z.array(TransitionSchema).optional(),
  captions: CaptionsSchema.optional(),
  overlays: z.array(OverlaySchema).optional(),
});

export type EditPlan = z.infer<typeof EditPlanSchema>;
export type VideoClip = z.infer<typeof VideoClipSchema>;
export type ClipFrame = z.infer<typeof ClipFrameSchema>;
export type AudioLane = z.infer<typeof AudioLaneSchema>;
export type Transition = z.infer<typeof TransitionSchema>;

export function clipDurationSec(clip: VideoClip): number {
  const raw = clip.out - clip.in;
  return raw / clip.speed;
}

export function computeTimelineDurationSec(plan: EditPlan): number {
  let cursor = 0;
  for (const clip of plan.lanes.video) {
    cursor += clipDurationSec(clip);
  }
  return cursor;
}

export function getTransitionBeforeIndex(
  plan: EditPlan,
  index: number,
): Transition | undefined {
  if (index <= 0 || !plan.transitions?.length) return undefined;
  const prev = plan.lanes.video[index - 1];
  const curr = plan.lanes.video[index];
  const key = `${prev.id}->${curr.id}`;
  return plan.transitions.find((t) => t.at === key);
}
