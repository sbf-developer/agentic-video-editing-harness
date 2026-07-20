import { z } from "zod";

export const SceneBoundarySchema = z.object({
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  score: z.number().optional(),
});

export const WordTimingSchema = z.object({
  word: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
});

export const AssetBaseSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  type: z.enum(["video", "audio", "image"]),
  durationSec: z.number().nonnegative().optional(),
  tags: z.array(z.string()).default([]),
  thumbnail: z.string().optional(),
});

export const VideoAssetSchema = AssetBaseSchema.extend({
  type: z.literal("video"),
  durationSec: z.number().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  hasAudio: z.boolean().optional(),
  codec: z.string().optional(),
  scenes: z.array(SceneBoundarySchema).optional(),
  transcript: z.string().nullable().optional(),
});

export const AudioAssetSchema = AssetBaseSchema.extend({
  type: z.literal("audio"),
  durationSec: z.number().positive(),
  wordTimings: z.array(WordTimingSchema).optional(),
  loudness: z
    .object({
      integratedLufs: z.number().optional(),
    })
    .optional(),
});

export const ImageAssetSchema = AssetBaseSchema.extend({
  type: z.literal("image"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const MediaAssetSchema = z.discriminatedUnion("type", [
  VideoAssetSchema,
  AudioAssetSchema,
  ImageAssetSchema,
]);

export const MediaIndexSchema = z.object({
  $schema: z.string().optional(),
  generatedAt: z.string(),
  assets: z.array(MediaAssetSchema),
});

export type MediaIndex = z.infer<typeof MediaIndexSchema>;
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type VideoAsset = z.infer<typeof VideoAssetSchema>;
export type AudioAsset = z.infer<typeof AudioAssetSchema>;

export function getAsset(index: MediaIndex, assetId: string): MediaAsset | undefined {
  return index.assets.find((a) => a.id === assetId);
}
