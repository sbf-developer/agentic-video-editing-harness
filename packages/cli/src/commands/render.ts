import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  generateRenderScripts,
  loadEditPlan,
  loadMediaIndex,
  parseBrief,
  runPostRenderQa,
  saveValidationResult,
  validateEdl,
  type ValidationResult,
} from "@video-harness/core";
import { findProjectDir } from "./init.js";
import { runValidate } from "./validate.js";

export interface RenderOptions {
  cwd: string;
  output?: string;
  skipValidate?: boolean;
  dryRun?: boolean;
  execute?: boolean;
}

export function runRender(options: RenderOptions): void {
  const projectDir = findProjectDir(options.cwd);

  if (!options.skipValidate) {
    const result = runValidate({ cwd: projectDir, requireApproved: false, json: false });
    if (!result.pass) {
      console.error("Render blocked — fix validation errors first (or use --skip-validate)");
      process.exit(1);
    }
  }

  const plan = loadEditPlan(join(projectDir, "edit-plan.json"));
  const index = loadMediaIndex(join(projectDir, "media-index.json"));
  const output = options.output ?? "renders/output.mp4";

  const generated = generateRenderScripts({
    projectDir,
    plan,
    index,
    outputPath: output,
  });

  console.log(`✓ Generated ${generated.shPath}`);
  console.log(`✓ Generated ${generated.ps1Path}`);

  if (options.dryRun) {
    console.log("\nDry run — commands:");
    generated.commands.forEach((c) => console.log(`  ${c}`));
    return;
  }

  if (!options.execute) {
    console.log(`\nRun: vh render --execute`);
    console.log(`  or: powershell -File scripts/render.ps1`);
    return;
  }

  const isWin = process.platform === "win32";
  const script = isWin ? generated.ps1Path : generated.shPath;
  const shell = isWin ? "powershell" : "bash";
  const args = isWin ? ["-ExecutionPolicy", "Bypass", "-File", script] : [script];

  console.log(`\n▶ Executing ${script}...`);
  const result = spawnSync(shell, args, {
    cwd: projectDir,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.error("Render failed");
    process.exit(1);
  }

  const outputPath = resolve(projectDir, generated.outputRelative);
  if (existsSync(outputPath)) {
    const brief = parseBrief(readFileSync(join(projectDir, "BRIEF.md"), "utf8"));
    const edlResult = validateEdl({
      projectDir,
      plan,
      index,
      brief,
    });
    const postChecks = runPostRenderQa(outputPath, edlResult.timelineDurationSec);
    const qaPath = join(projectDir, "qa", "validation.json");
    const prior = existsSync(qaPath)
      ? (JSON.parse(readFileSync(qaPath, "utf8")) as ValidationResult)
      : null;

    const merged: ValidationResult = {
      timestamp: new Date().toISOString(),
      planVersion: plan.version,
      pass: prior?.pass ?? true,
      checks: [...(prior?.checks ?? []), ...postChecks],
      errors: prior?.errors ?? [],
    };
    saveValidationResult(qaPath, merged);
    console.log(`✓ Render complete: ${outputPath}`);
  }
}
