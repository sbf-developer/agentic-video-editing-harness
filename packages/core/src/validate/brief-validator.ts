import matter from "gray-matter";
import {
  BriefFrontmatterSchema,
  SOCIAL_PLATFORMS,
  type BriefFrontmatter,
} from "../schemas/brief.js";
import type { ValidationCheck } from "../schemas/validation-result.js";

export interface ParsedBrief {
  frontmatter: BriefFrontmatter;
  body: string;
}

export function parseBrief(content: string): ParsedBrief {
  const { data, content: body } = matter(content);
  const frontmatter = BriefFrontmatterSchema.parse(data);
  return { frontmatter, body };
}

export function validateBrief(parsed: ParsedBrief): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const { frontmatter, body } = parsed;

  checks.push({
    id: "brief-status",
    pass: frontmatter.status === "approved",
    detail:
      frontmatter.status === "approved"
        ? "Brief is approved"
        : `Brief status is "${frontmatter.status}" — approve before final render`,
    severity: "warning",
  });

  checks.push({
    id: "brief-project-name",
    pass: frontmatter.project.trim().length > 0,
    detail: frontmatter.project.trim().length > 0 ? "Project name set" : "Missing project name",
  });

  checks.push({
    id: "brief-duration-cap",
    pass: frontmatter.maxDurationSec > 0 && frontmatter.maxDurationSec <= 600,
    detail: `Max duration: ${frontmatter.maxDurationSec}s`,
  });

  const hasGoal = /## Goal/i.test(body) && body.split("## Goal")[1]?.trim().length > 0;
  checks.push({
    id: "brief-goal-section",
    pass: hasGoal,
    detail: hasGoal ? "Goal section present" : 'Missing "## Goal" section in brief body',
    severity: "warning",
  });

  if (SOCIAL_PLATFORMS.has(frontmatter.platform.toLowerCase())) {
    checks.push({
      id: "brief-social-duration",
      pass: frontmatter.maxDurationSec <= 60,
      detail: `Social platform "${frontmatter.platform}" — ${frontmatter.maxDurationSec}s cap`,
      severity: frontmatter.maxDurationSec <= 60 ? "warning" : "error",
    });
  }

  return checks;
}

export function briefBlocksRender(checks: ValidationCheck[]): boolean {
  return checks.some((c) => !c.pass && (c.severity ?? "error") === "error");
}
