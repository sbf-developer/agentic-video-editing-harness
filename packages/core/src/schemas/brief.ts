import { z } from "zod";

export const BriefStatusSchema = z.enum(["draft", "review", "approved"]);
export const BriefRouteSchema = z.enum(["assembly", "motion", "recut", "music-sync"]);
export const BriefFlowSchema = z.enum(["automation", "companion"]);
export const BriefAspectSchema = z.enum(["9:16", "16:9", "1:1", "4:5"]);

export const BriefFrontmatterSchema = z.object({
  project: z.string().min(1),
  status: BriefStatusSchema.default("draft"),
  route: BriefRouteSchema.default("assembly"),
  platform: z.string().default("tiktok"),
  aspect: BriefAspectSchema.default("9:16"),
  maxDurationSec: z.number().positive(),
  tone: z.string().optional(),
  musicLeads: z.boolean().default(false),
  storyboard: z.enum(["yes", "no"]).default("no"),
  flow: BriefFlowSchema.default("automation"),
});

export type BriefFrontmatter = z.infer<typeof BriefFrontmatterSchema>;

export const SOCIAL_PLATFORMS = new Set([
  "tiktok",
  "instagram",
  "reels",
  "shorts",
  "twitter",
  "x",
]);

export const PURPOSE_TAGS = [
  "clip",
  "hook",
  "problem",
  "solution",
  "proof",
  "broll",
  "cta",
] as const;

export type PurposeTag = (typeof PURPOSE_TAGS)[number];

export const ASPECT_DIMENSIONS: Record<
  z.infer<typeof BriefAspectSchema>,
  { width: number; height: number }
> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};
