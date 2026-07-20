import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clipDurationSec,
  getAsset,
  loadMediaIndex,
  parseBrief,
  type EditPlan,
  type MediaAsset,
  type MediaIndex,
} from "@video-harness/core";

export interface ContextRequest {
  mention: string;
  projectDir: string;
  plan?: EditPlan;
  index?: MediaIndex;
  maxChars?: number;
}

export interface ContextSnippet {
  mention: string;
  type: "brief" | "edl" | "edl-row" | "asset" | "transcript" | "help";
  content: string;
  attachments?: string[];
}

const HELP = `# @-mentions

- @brief          — full BRIEF.md
- @plan / @edl    — full edit-plan.json
- @clip:<id>      — EDL row + asset metadata
- @asset:<id>     — media-index entry
- @vo             — voiceover lane + word timings
- search:<query>  — semantic tag search on index
`;

export function resolveContext(request: ContextRequest): ContextSnippet {
  const { mention, projectDir } = request;
  const maxChars = request.maxChars ?? 8000;
  const trimmed = mention.trim().replace(/^@/, "");

  if (trimmed === "help" || trimmed === "mentions") {
    return { mention, type: "help", content: HELP };
  }

  if (trimmed === "brief") {
    const path = join(projectDir, "BRIEF.md");
    const content = readFileSync(path, "utf8");
    return {
      mention,
      type: "brief",
      content: content.slice(0, maxChars),
    };
  }

  if (trimmed === "plan" || trimmed === "edl") {
    const path = join(projectDir, "edit-plan.json");
    const content = readFileSync(path, "utf8");
    return { mention, type: "edl", content: content.slice(0, maxChars) };
  }

  if (trimmed.startsWith("clip:")) {
    const clipId = trimmed.slice(5);
    const plan = request.plan ?? JSON.parse(readFileSync(join(projectDir, "edit-plan.json"), "utf8"));
    const index = request.index ?? JSON.parse(readFileSync(join(projectDir, "media-index.json"), "utf8"));
    const clip = plan.lanes.video.find((c: { id: string }) => c.id === clipId);
    if (!clip) {
      return { mention, type: "edl-row", content: `Clip not found: ${clipId}` };
    }
    const asset = getAsset(index, clip.assetId);
    const body = {
      clip,
      durationOnTimeline: clipDurationSec(clip),
      asset: asset ?? null,
    };
    return {
      mention,
      type: "edl-row",
      content: JSON.stringify(body, null, 2).slice(0, maxChars),
      attachments: asset?.thumbnail ? [join(projectDir, asset.thumbnail)] : undefined,
    };
  }

  if (trimmed.startsWith("asset:")) {
    const assetId = trimmed.slice(6);
    const index = request.index ?? JSON.parse(readFileSync(join(projectDir, "media-index.json"), "utf8"));
    const asset = getAsset(index, assetId);
    if (!asset) {
      return { mention, type: "asset", content: `Asset not found: ${assetId}` };
    }
    return {
      mention,
      type: "asset",
      content: JSON.stringify(asset, null, 2).slice(0, maxChars),
      attachments: asset.thumbnail ? [join(projectDir, asset.thumbnail)] : undefined,
    };
  }

  if (trimmed === "vo") {
    const plan = request.plan ?? JSON.parse(readFileSync(join(projectDir, "edit-plan.json"), "utf8"));
    const index = request.index ?? JSON.parse(readFileSync(join(projectDir, "media-index.json"), "utf8"));
    const vo = plan.lanes.voiceover;
    if (!vo) {
      return { mention, type: "transcript", content: "No voiceover lane in plan." };
    }
    const asset = getAsset(index, vo.assetId);
    const body = { voiceover: vo, asset };
    return {
      mention,
      type: "transcript",
      content: JSON.stringify(body, null, 2).slice(0, maxChars),
    };
  }

  if (trimmed.startsWith("search:")) {
    const query = trimmed.slice(7).toLowerCase();
    const index = request.index ?? loadMediaIndex(join(projectDir, "media-index.json"));
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = index.assets.filter((a: MediaAsset) => {
      const hay = `${a.id} ${a.path} ${a.tags.join(" ")}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    return {
      mention,
      type: "asset",
      content: JSON.stringify(matches.slice(0, 10), null, 2).slice(0, maxChars),
    };
  }

  return {
    mention,
    type: "help",
    content: `Unknown mention "${trimmed}".\n\n${HELP}`,
  };
}

export function resolveNaturalQuery(
  _projectDir: string,
  query: string,
  index: MediaIndex,
): ContextSnippet[] {
  const q = query.toLowerCase();
  const snippets: ContextSnippet[] = [];

  for (const asset of index.assets) {
    const hay = `${asset.id} ${asset.path} ${asset.tags.join(" ")}`.toLowerCase();
    if (q.split(/\s+/).every((term) => hay.includes(term))) {
      snippets.push({
        mention: `@asset:${asset.id}`,
        type: "asset",
        content: JSON.stringify(asset, null, 2),
      });
    }
  }

  return snippets.slice(0, 5);
}

export function loadBriefContext(projectDir: string): string {
  try {
    const content = readFileSync(join(projectDir, "BRIEF.md"), "utf8");
    const parsed = parseBrief(content);
    return JSON.stringify(parsed.frontmatter, null, 2);
  } catch {
    return "{}";
  }
}
