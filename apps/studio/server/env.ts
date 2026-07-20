import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const STUDIO_ENV = join(REPO_ROOT, "apps/studio/.env");
const ROOT_ENV = join(REPO_ROOT, ".env");

if (existsSync(STUDIO_ENV)) config({ path: STUDIO_ENV });
if (existsSync(ROOT_ENV)) config({ path: ROOT_ENV, override: false });

export function getDeepSeekApiKey(override?: string): string | undefined {
  const key = override?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
  return key || undefined;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}
