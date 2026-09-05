/**
 * User-scoped config under `~/.ii/` (sanctioned Principle IV exception):
 * a model-preference file plus a separate 0600 credentials file.
 * Legacy env config (`II_MODEL`, provider keys via env) is never read here.
 * No I/O at import time — everything happens inside these functions.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export type ProviderName = "anthropic" | "meta";

export interface Credentials {
  anthropic?: string;
  meta?: string;
}

const iiDir = join(homedir(), ".ii");
const preferencePath = join(iiDir, "model.json");
const credentialsPath = join(iiDir, "credentials.json");

function readJson(path: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(readFileSync(path, "utf-8")), error: null };
  } catch (e) {
    return { value: null, error: `Error reading ${path}: ${(e as Error).message}` };
  }
}

export function loadPreference(): { current: string | null; error: string | null } {
  if (!existsSync(preferencePath)) return { current: null, error: null };
  const { value, error } = readJson(preferencePath);
  if (error) return { current: null, error };
  const current = (value as { current?: unknown } | null)?.current;
  if (typeof current !== "string" || !current) {
    return { current: null, error: `Error reading ${preferencePath}: "current" must be a model id string` };
  }
  return { current, error: null };
}

export function savePreference(modelId: string): string | null {
  try {
    mkdirSync(iiDir, { recursive: true });
    writeFileSync(preferencePath, JSON.stringify({ current: modelId }) + "\n", "utf-8");
    return null;
  } catch (e) {
    return `Error writing ${preferencePath}: ${(e as Error).message}`;
  }
}

export function loadCredentials(): { credentials: Credentials; error: string | null } {
  if (!existsSync(credentialsPath)) return { credentials: {}, error: null };
  const { value, error } = readJson(credentialsPath);
  if (error) return { credentials: {}, error };
  const credentials: Credentials = {};
  const obj = (value ?? {}) as Record<string, unknown>;
  for (const provider of ["anthropic", "meta"] as const) {
    if (typeof obj[provider] === "string" && (obj[provider] as string)) {
      credentials[provider] = obj[provider] as string;
    }
  }
  return { credentials, error: null };
}

export function saveCredential(provider: ProviderName, key: string): string | null {
  try {
    mkdirSync(iiDir, { recursive: true });
    const { credentials } = loadCredentials();
    credentials[provider] = key;
    writeFileSync(credentialsPath, JSON.stringify(credentials) + "\n", { encoding: "utf-8", mode: 0o600 });
    return null;
  } catch (e) {
    return `Error writing ${credentialsPath}: ${(e as Error).message}`;
  }
}
