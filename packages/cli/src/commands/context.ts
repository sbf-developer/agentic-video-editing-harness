import { join } from "node:path";
import { loadEditPlan, loadMediaIndex } from "@video-harness/core";
import { resolveContext } from "@video-harness/context";
import { findProjectDir } from "./init.js";

export interface ContextOptions {
  cwd: string;
  mention: string;
}

export function runContext(options: ContextOptions): void {
  const projectDir = findProjectDir(options.cwd);
  const plan = loadEditPlan(join(projectDir, "edit-plan.json"));
  const index = loadMediaIndex(join(projectDir, "media-index.json"));

  const snippet = resolveContext({
    mention: options.mention,
    projectDir,
    plan,
    index,
  });

  console.log(`# ${snippet.type} — ${snippet.mention}\n`);
  console.log(snippet.content);
  if (snippet.attachments?.length) {
    console.log("\nAttachments:");
    snippet.attachments.forEach((a) => console.log(`  · ${a}`));
  }
}
