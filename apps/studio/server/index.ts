import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  generateRenderScripts,
  loadEditPlan,
  loadMediaIndex,
  parseBrief,
  saveValidationResult,
  validateBrief,
  validateEdl,
  type ValidationResult,
} from "@video-harness/core";
import { buildMediaIndex } from "@video-harness/ingest";
import { captureSnapshots, runPostRenderQa } from "@video-harness/core";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const PROJECTS_DIR = join(REPO_ROOT, "projects");

const app = express();
app.use(express.json());

function listProjects(): string[] {
  if (!existsSync(PROJECTS_DIR)) return [];
  return readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(PROJECTS_DIR, d.name, "edit-plan.json")))
    .map((d) => d.name);
}

function projectPath(id: string): string {
  const p = join(PROJECTS_DIR, id);
  if (!existsSync(join(p, "edit-plan.json"))) throw new Error("Project not found");
  return p;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, repoRoot: REPO_ROOT });
});

app.get("/api/projects", (_req, res) => {
  res.json({ projects: listProjects() });
});

app.get("/api/projects/:id", (req, res) => {
  try {
    const dir = projectPath(req.params.id);
    const briefRaw = existsSync(join(dir, "BRIEF.md"))
      ? readFileSync(join(dir, "BRIEF.md"), "utf8")
      : "";
    const outputVideo = join(dir, "renders/output.mp4");
    const snapshotsDir = join(dir, "qa/snapshots");
    const snapshots = existsSync(snapshotsDir)
      ? readdirSync(snapshotsDir)
          .filter((f) => f.endsWith(".jpg"))
          .sort()
      : [];

    res.json({
      id: req.params.id,
      brief: briefRaw,
      briefFrontmatter: briefRaw ? parseBrief(briefRaw).frontmatter : null,
      plan: readJson(join(dir, "edit-plan.json")),
      index: readJson(join(dir, "media-index.json")),
      validation: readJson<ValidationResult>(join(dir, "qa/validation.json")),
      hasOutput: existsSync(outputVideo),
      outputUrl: existsSync(outputVideo) ? `/media/${req.params.id}/renders/output.mp4` : null,
      snapshots: snapshots.map((s) => `/media/${req.params.id}/qa/snapshots/${s}`),
    });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/ingest", async (req, res) => {
  try {
    const dir = projectPath(req.params.id);
    const paths = (req.body?.paths as string[]) ?? ["assets"];
    const index = await buildMediaIndex({ projectDir: dir, paths });
    const { saveMediaIndex } = await import("@video-harness/core");
    saveMediaIndex(join(dir, "media-index.json"), index);
    res.json({ ok: true, assets: index.assets.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/validate", (req, res) => {
  try {
    const dir = projectPath(req.params.id);
    const brief = parseBrief(readFileSync(join(dir, "BRIEF.md"), "utf8"));
    const plan = loadEditPlan(join(dir, "edit-plan.json"));
    const index = loadMediaIndex(join(dir, "media-index.json"));
    const briefChecks = validateBrief(brief);
    const edlResult = validateEdl({ projectDir: dir, plan, index, brief });
    const pass = !briefChecks.some((c) => !c.pass && (c.severity ?? "error") === "error") && edlResult.pass;
    const result: ValidationResult = {
      timestamp: new Date().toISOString(),
      planVersion: plan.version,
      pass,
      checks: [...briefChecks, ...edlResult.checks],
      errors: edlResult.errors,
    };
    saveValidationResult(join(dir, "qa/validation.json"), result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/render", async (req, res) => {
  try {
    const dir = projectPath(req.params.id);
    const plan = loadEditPlan(join(dir, "edit-plan.json"));
    const index = loadMediaIndex(join(dir, "media-index.json"));
    generateRenderScripts({ projectDir: dir, plan, index });

    const isWin = process.platform === "win32";
    const script = isWin ? join(dir, "scripts/render.ps1") : join(dir, "scripts/render.sh");
    const shell = isWin ? "powershell" : "bash";
    const args = isWin ? ["-ExecutionPolicy", "Bypass", "-File", script] : [script];

    await new Promise<void>((resolvePromise, reject) => {
      const proc = spawn(shell, args, { cwd: dir, stdio: "pipe" });
      let err = "";
      proc.stderr?.on("data", (d) => (err += d.toString()));
      proc.on("close", (code) => (code === 0 ? resolvePromise() : reject(new Error(err || `Render failed (${code})`))));
    });

    const outputPath = join(dir, "renders/output.mp4");
    const brief = parseBrief(readFileSync(join(dir, "BRIEF.md"), "utf8"));
    const edlResult = validateEdl({ projectDir: dir, plan, index, brief });
    const postChecks = runPostRenderQa(outputPath, edlResult.timelineDurationSec);
    const prior = readJson<ValidationResult>(join(dir, "qa/validation.json"));
    const merged: ValidationResult = {
      timestamp: new Date().toISOString(),
      planVersion: plan.version,
      pass: prior?.pass ?? true,
      checks: [...(prior?.checks ?? []), ...postChecks],
      errors: prior?.errors ?? [],
    };
    saveValidationResult(join(dir, "qa/validation.json"), merged);

    res.json({ ok: true, outputUrl: `/media/${req.params.id}/renders/output.mp4` });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/snapshot", (req, res) => {
  try {
    const dir = projectPath(req.params.id);
    const plan = loadEditPlan(join(dir, "edit-plan.json"));
    const videoPath = join(dir, "renders/output.mp4");
    if (!existsSync(videoPath)) {
      res.status(400).json({ error: "No output video — render first" });
      return;
    }
    const result = captureSnapshots({ projectDir: dir, videoPath, plan });
    const prior = readJson<ValidationResult>(join(dir, "qa/validation.json"));
    const merged: ValidationResult = {
      timestamp: new Date().toISOString(),
      planVersion: plan.version,
      pass: prior?.pass ?? true,
      checks: prior?.checks ?? [],
      errors: prior?.errors ?? [],
      snapshots: result.snapshots.map((s) =>
        `/media/${req.params.id}/qa/snapshots/${s.split(/[/\\]/).pop()}`,
      ),
    };
    saveValidationResult(join(dir, "qa/validation.json"), merged);
    res.json({ ok: true, snapshots: merged.snapshots });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.use("/media", express.static(PROJECTS_DIR));

const PORT = 3847;
app.listen(PORT, () => {
  console.log(`\n  Video Harness API  →  http://localhost:${PORT}`);
  console.log(`  Studio UI          →  http://localhost:5173\n`);
});
