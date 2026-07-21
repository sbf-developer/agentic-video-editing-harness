import { readFileSync } from "node:fs";
import { EditPlanSchema, VideoClipSchema, saveEditPlan, type EditPlan } from "@video-harness/core";
import { z } from "zod";

/** Studio allows empty timelines while drafting. */
export const StudioEditPlanSchema = EditPlanSchema.extend({
  lanes: EditPlanSchema.shape.lanes.extend({
    video: z.array(VideoClipSchema),
  }),
});

export type StudioEditPlan = z.infer<typeof StudioEditPlanSchema>;

export function loadStudioPlan(path: string): StudioEditPlan {
  return StudioEditPlanSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function saveStudioPlan(path: string, plan: StudioEditPlan): void {
  saveEditPlan(path, plan as EditPlan);
}
