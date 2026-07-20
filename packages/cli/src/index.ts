#!/usr/bin/env node
import { Command } from "commander";
import { initProject, type InitOptions } from "./commands/init.js";

type Aspect = InitOptions["aspect"];
import { runIngest } from "./commands/ingest.js";
import { runValidate } from "./commands/validate.js";
import { runRender } from "./commands/render.js";
import { runSnapshot } from "./commands/snapshot.js";
import { runContext } from "./commands/context.js";

const program = new Command();

program
  .name("vh")
  .description("Video harness — Cursor for video editing")
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold a new video project")
  .requiredOption("-n, --name <name>", "Project name")
  .option("-d, --dir <dir>", "Project directory", ".")
  .option("-p, --platform <platform>", "Target platform", "tiktok")
  .option("-a, --aspect <aspect>", "Aspect ratio (9:16, 16:9, 1:1, 4:5)", "9:16")
  .option("--max-duration <sec>", "Max duration in seconds", "15")
  .action((opts) => {
    initProject({
      projectDir: opts.dir,
      name: opts.name,
      platform: opts.platform,
      aspect: opts.aspect as Aspect,
      maxDurationSec: parseInt(opts.maxDuration, 10),
    });
  });

program
  .command("ingest")
  .description("Probe media and build media-index.json")
  .argument("[paths...]", "Files or directories to index", ["assets"])
  .option("-C, --project <dir>", "Project directory", process.cwd())
  .option("--no-scenes", "Skip scene detection")
  .option("--no-thumbs", "Skip thumbnail capture")
  .action(async (paths, opts) => {
    await runIngest({
      cwd: opts.project,
      paths,
      noScenes: !opts.scenes,
      noThumbs: !opts.thumbs,
    });
  });

program
  .command("validate")
  .description("Validate BRIEF + EDL before render")
  .option("-C, --project <dir>", "Project directory", process.cwd())
  .option("--require-approved", "Require approved brief and plan")
  .option("--json", "Output JSON only")
  .action((opts) => {
    runValidate({
      cwd: opts.project,
      requireApproved: opts.requireApproved,
      json: opts.json,
    });
  });

program
  .command("render")
  .description("Generate render scripts and optionally execute")
  .option("-C, --project <dir>", "Project directory", process.cwd())
  .option("-o, --output <path>", "Output path relative to project", "renders/output.mp4")
  .option("--skip-validate", "Skip pre-render validation")
  .option("--dry-run", "Print commands without writing scripts")
  .option("--execute", "Run generated render script")
  .action((opts) => {
    runRender({
      cwd: opts.project,
      output: opts.output,
      skipValidate: opts.skipValidate,
      dryRun: opts.dryRun,
      execute: opts.execute,
    });
  });

program
  .command("snapshot")
  .description("Capture QA keyframes from rendered video")
  .option("-C, --project <dir>", "Project directory", process.cwd())
  .option("-i, --video <path>", "Video path relative to project")
  .action((opts) => {
    runSnapshot({ cwd: opts.project, video: opts.video });
  });

program
  .command("context")
  .description("Resolve @-mention context for AI agents")
  .argument("<mention>", "e.g. brief, clip:hook, asset:lake, search:calm")
  .option("-C, --project <dir>", "Project directory", process.cwd())
  .action((mention, opts) => {
    runContext({ cwd: opts.project, mention });
  });

program.parse();
