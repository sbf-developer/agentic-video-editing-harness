import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildRepairContext,
  loadEditPlan,
  loadMediaIndex,
  saveValidationResult,
  validateBrief,
  validateEdl,
  parseBrief,
  type ValidationResult,
} from "@video-harness/core";
import { findProjectDir } from "./init.js";

export interface ValidateOptions {
  cwd: string;
  requireApproved?: boolean;
  json?: boolean;
}

export function runValidate(options: ValidateOptions): ValidationResult {
  const projectDir = findProjectDir(options.cwd);
  const briefPath = join(projectDir, "BRIEF.md");
  const planPath = join(projectDir, "edit-plan.json");
  const indexPath = join(projectDir, "media-index.json");
  const outPath = join(projectDir, "qa", "validation.json");

  const briefContent = readFileSync(briefPath, "utf8");
  const parsedBrief = parseBrief(briefContent);
  const briefChecks = validateBrief(parsedBrief);

  const plan = loadEditPlan(planPath);
  const index = loadMediaIndex(indexPath);

  const edlResult = validateEdl({
    projectDir,
    plan,
    index,
    brief: parsedBrief,
    requireApprovedPlan: options.requireApproved ?? false,
  });

  const allChecks = [...briefChecks, ...edlResult.checks];
  const briefBlocking = briefChecks.some((c) => !c.pass && (c.severity ?? "error") === "error");
  const pass = !briefBlocking && edlResult.pass;

  const result: ValidationResult = {
    timestamp: new Date().toISOString(),
    planVersion: plan.version,
    pass,
    checks: allChecks,
    errors: edlResult.errors,
  };

  saveValidationResult(outPath, result);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(pass ? "✓ Validation passed" : "✗ Validation failed");
    for (const check of allChecks) {
      const icon = check.pass ? "✓" : (check.severity ?? "error") === "warning" ? "⚠" : "✗";
      console.log(`  ${icon} ${check.id}: ${check.detail}`);
    }
    if (!pass) {
      console.log("\nRepair context:");
      console.log(JSON.stringify(buildRepairContext(edlResult), null, 2));
    }
    console.log(`\nWrote ${outPath}`);
  }

  if (!pass) process.exitCode = 1;
  return result;
}
