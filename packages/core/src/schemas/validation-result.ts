import { z } from "zod";

export const ValidationCheckSchema = z.object({
  id: z.string(),
  pass: z.boolean(),
  detail: z.string(),
  severity: z.enum(["error", "warning"]).optional(),
});

export const ValidationResultSchema = z.object({
  timestamp: z.string(),
  planVersion: z.number().optional(),
  pass: z.boolean(),
  checks: z.array(ValidationCheckSchema),
  errors: z.array(
    z.object({
      check: z.string(),
      message: z.string(),
      suggestion: z.string().optional(),
    }),
  ),
  snapshots: z.array(z.string()).optional(),
});

export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export function checkSeverity(c: ValidationCheck): "error" | "warning" {
  return c.severity ?? "error";
}
