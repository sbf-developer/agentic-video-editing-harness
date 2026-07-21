import "./env.js";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import {
  generateRenderScripts,
  loadEditPlan,
  loadMediaIndex,
  saveMediaIndex,
  validateEdl,
  captureSnapshots,
  runPostRenderQa,
  type EditPlan,
} from "@video-harness/core";

import { generateEditPlan } from "./ai.js";
import { getDeepSeekApiKey, isAiConfigured } from "./env.js";
import { indexStudioAssets, syncStudioIndexIfNeeded } from "./ingest.js";
import { loadStudioPlan, saveStudioPlan, StudioEditPlanSchema } from "./plan.js";
import { scaffoldProject } from "./project.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const PROJECTS_DIR = join(REPO_ROOT, "projects");

const app = express();
app.use(express.json({ limit: "2mb" }));

function listProjects(): string[] {
  if (!existsSync(PROJECTS_DIR)) mkdirSync(PROJECTS_DIR, { recursive: true });
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

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = join(projectPath(param(req.params.id)), "assets");
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, safe);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({ aiConfigured: isAiConfigured() });
});

app.get("/api/projects", (_req, res) => {
  res.json({ projects: listProjects() });
});

app.post("/api/projects", (req, res) => {
  try {
    const name = (req.body?.name as string) || "Untitled";
    const id = scaffoldProject(PROJECTS_DIR, name);
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/projects/:id", async (req, res) => {
  try {
    const dir = projectPath(param(req.params.id));
    const id = param(req.params.id);
    const index = await syncStudioIndexIfNeeded(dir);
    const outputVideo = join(dir, "renders/output.mp4");
    res.json({
      id,
      plan: readJson(join(dir, "edit-plan.json")),
      index,
      outputUrl: existsSync(outputVideo)
        ? `/media/${id}/renders/output.mp4?t=${Date.now()}`
        : null,
    });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.put("/api/projects/:id/plan", (req, res) => {
  try {
    const dir = projectPath(param(req.params.id));
    const plan = StudioEditPlanSchema.parse(req.body);
    saveStudioPlan(join(dir, "edit-plan.json"), plan);
    res.json({ ok: true, plan });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.delete("/api/projects/:id/assets/:assetId", async (req, res) => {
  try {
    const dir = projectPath(param(req.params.id));
    const assetId = param(req.params.assetId);
    const index = loadMediaIndex(join(dir, "media-index.json"));
    const asset = index.assets.find((a) => a.id === assetId);
    if (!asset) return res.status(404).json({ error: "Asset not found" });

    const filePath = join(dir, asset.path);
    if (existsSync(filePath)) unlinkSync(filePath);
    if (asset.thumbnail) {
      const thumbPath = join(dir, asset.thumbnail);
      if (existsSync(thumbPath)) unlinkSync(thumbPath);
    }

    const newIndex = {
      ...index,
      generatedAt: new Date().toISOString(),
      assets: index.assets.filter((a) => a.id !== assetId),
    };
    saveMediaIndex(join(dir, "media-index.json"), newIndex);

    const plan = loadStudioPlan(join(dir, "edit-plan.json"));
    plan.lanes.video = plan.lanes.video.filter((c) => c.assetId !== assetId);
    if (plan.lanes.music?.assetId === assetId) delete plan.lanes.music;
    if (plan.lanes.voiceover?.assetId === assetId) delete plan.lanes.voiceover;
    if (plan.lanes.sfx) {
      plan.lanes.sfx = plan.lanes.sfx.filter((s) => s.assetId !== assetId);
    }
    saveStudioPlan(join(dir, "edit-plan.json"), plan);

    res.json({ ok: true, plan, assets: newIndex.assets });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/upload", upload.array("files", 20), async (req, res) => {
  try {
    const dir = projectPath(param(req.params.id));
    const uploaded = (req.files as Express.Multer.File[])?.length ?? 0;
    if (!uploaded) return res.status(400).json({ error: "No files received" });

    const index = await indexStudioAssets(dir);
    res.json({ ok: true, assets: index.assets, uploaded });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/ingest", async (req, res) => {
  try {
    const dir = projectPath(param(req.params.id));
    const index = await indexStudioAssets(dir);
    res.json({ ok: true, assets: index.assets });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/ai-edit", async (req, res) => {
  try {
    const { prompt, apiKey } = req.body as { prompt?: string; apiKey?: string };
    if (!prompt?.trim()) return res.status(400).json({ error: "Prompt required" });

    const key = getDeepSeekApiKey(apiKey);
    if (!key) {
      return res.status(400).json({
        error: "DeepSeek API key not configured. Copy apps/studio/.env.example to apps/studio/.env and set DEEPSEEK_API_KEY.",
      });
    }

    const dir = projectPath(param(req.params.id));
    const currentPlan = loadStudioPlan(join(dir, "edit-plan.json"));
    const index = loadMediaIndex(join(dir, "media-index.json"));

    if (!index.assets.length) {
      return res.status(400).json({ error: "Upload assets before asking AI to edit" });
    }

    const plan = await generateEditPlan({
      apiKey: key,
      prompt: prompt.trim(),
      currentPlan: currentPlan as EditPlan,
      mediaIndex: index,
    });

    const studioPlan = StudioEditPlanSchema.parse(plan);
    saveStudioPlan(join(dir, "edit-plan.json"), studioPlan);
    res.json({ ok: true, plan: studioPlan });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/render", async (req, res) => {
  try {
    const dir = projectPath(param(req.params.id));
    const plan = loadEditPlan(join(dir, "edit-plan.json"));
    const index = loadMediaIndex(join(dir, "media-index.json"));

    if (!plan.lanes.video.length) {
      return res.status(400).json({ error: "Timeline is empty" });
    }

    const edlResult = validateEdl({ projectDir: dir, plan, index });
    if (!edlResult.pass) {
      return res.status(400).json({ error: "Invalid timeline", details: edlResult.errors });
    }

    generateRenderScripts({ projectDir: dir, plan, index });

    const isWin = process.platform === "win32";
    const script = isWin ? join(dir, "scripts/render.ps1") : join(dir, "scripts/render.sh");
    const shell = isWin ? "powershell" : "bash";
    const args = isWin ? ["-ExecutionPolicy", "Bypass", "-File", script] : [script];

    await new Promise<void>((resolvePromise, reject) => {
      const proc = spawn(shell, args, { cwd: dir, stdio: "pipe" });
      let err = "";
      proc.stderr?.on("data", (d) => (err += d.toString()));
      proc.on("close", (code) => (code === 0 ? resolvePromise() : reject(new Error(err.slice(-800) || `Render failed (${code})`))));
    });

    const outputPath = join(dir, "renders/output.mp4");
    runPostRenderQa(outputPath, edlResult.timelineDurationSec);

    res.json({ ok: true, outputUrl: `/media/${req.params.id}/renders/output.mp4?t=${Date.now()}` });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/snapshot", (req, res) => {
  try {
    const dir = projectPath(param(req.params.id));
    const plan = loadEditPlan(join(dir, "edit-plan.json"));
    const videoPath = join(dir, "renders/output.mp4");
    if (!existsSync(videoPath)) return res.status(400).json({ error: "Render first" });
    captureSnapshots({ projectDir: dir, videoPath, plan });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.use(
  "/media",
  express.static(PROJECTS_DIR, {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
      else if (filePath.endsWith(".webm")) res.setHeader("Content-Type", "video/webm");
      else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) res.setHeader("Content-Type", "image/jpeg");
      else if (filePath.endsWith(".png")) res.setHeader("Content-Type", "image/png");
      res.setHeader("Accept-Ranges", "bytes");
    },
  }),
);

const PORT = 3847;
app.listen(PORT, () => {
  console.log(`\n  Studio API   http://localhost:${PORT}`);
  console.log(`  Studio UI    http://localhost:5173\n`);
});
