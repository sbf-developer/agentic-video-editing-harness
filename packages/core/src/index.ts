import { readFileSync, writeFileSync } from "node:fs";
import { parseBrief } from "./validate/brief-validator.js";
import { EditPlanSchema, type EditPlan } from "./schemas/edl.js";
import { MediaIndexSchema, type MediaIndex } from "./schemas/media-index.js";
import type { ValidationResult } from "./schemas/validation-result.js";

export {
  BriefAspectSchema,
  BriefFrontmatterSchema,
  SOCIAL_PLATFORMS,
  PURPOSE_TAGS,
  ASPECT_DIMENSIONS,
} from "./schemas/brief.js";
export type { BriefFrontmatter } from "./schemas/brief.js";
export * from "./schemas/edl.js";
export * from "./schemas/media-index.js";
export type { ValidationResult, ValidationCheck } from "./schemas/validation-result.js";
export { ValidationResultSchema, checkSeverity } from "./schemas/validation-result.js";
export * from "./validate/brief-validator.js";
export { parseBrief } from "./validate/brief-validator.js";
export * from "./validate/edl-validator.js";
export * from "./render/ffmpeg-generator.js";
export * from "./qa/snapshot.js";

export function loadEditPlan(path: string): EditPlan {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return EditPlanSchema.parse(raw);
}

export function loadMediaIndex(path: string): MediaIndex {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return MediaIndexSchema.parse(raw);
}

export function saveEditPlan(path: string, plan: EditPlan): void {
  writeFileSync(path, JSON.stringify(plan, null, 2) + "\n", "utf8");
}

export function saveMediaIndex(path: string, index: MediaIndex): void {
  writeFileSync(path, JSON.stringify(index, null, 2) + "\n", "utf8");
}

export function saveValidationResult(path: string, result: ValidationResult): void {
  writeFileSync(path, JSON.stringify(result, null, 2) + "\n", "utf8");
}

export function parseBriefFile(path: string) {
  return parseBrief(readFileSync(path, "utf8"));
}
