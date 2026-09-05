import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * A named, reusable instruction set invokable as a slash command.
 * Backed by exactly one SKILL.md file on disk. See specs/001-skill-command-loading/data-model.md.
 */
export interface Skill {
  /** Canonical lookup key — the directory name under its source, not the frontmatter name. */
  name: string;
  /** Frontmatter `name:` field. Informational only; not used for lookup. */
  frontmatterName: string;
  /** Frontmatter `description:` field. Used only for the discovery listing (FR-008). */
  description: string;
  /** Everything after the closing `---` frontmatter delimiter. May contain $ARGUMENTS. */
  body: string;
  /** Which discovery location produced this entry. */
  source: "ii-native" | "claude-compatible";
  /** Resolved absolute path to the SKILL.md file, for diagnostics only. */
  filePath: string;
}

/** Built-in command names a skill may never override under its bare form (FR-005a). */
export const RESERVED_COMMAND_NAMES = new Set(["clear", "exit", "quit", "model"]);

/**
 * Resolve `<baseDir>/<name>/SKILL.md`, rejecting any path that would escape `baseDir`
 * (e.g. via ".." in `name`). Returns null for an unsafe path — treated as "no such skill",
 * never as a crash (constitution Principle II; research.md Decision 3).
 */
function resolveSkillPath(baseDir: string, name: string): string | null {
  const resolvedBase = resolve(baseDir);
  const candidate = resolve(join(baseDir, name, "SKILL.md"));
  if (candidate !== resolvedBase && !candidate.startsWith(resolvedBase + "/")) {
    return null;
  }
  return candidate;
}

/**
 * Extract `name`, `description`, and `body` from a SKILL.md file's contents, per
 * contracts/skill-file-format.md. Hand-rolled rather than a YAML dependency (research.md
 * Decision 1) — only `name` and `description` are read; every other frontmatter field is
 * ignored. Returns null if the file doesn't satisfy the required shape.
 */
export function parseSkillFile(
  content: string
): { name: string; description: string; body: string } | null {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return null;

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) return null;

  let name = "";
  let description = "";
  for (const line of lines.slice(1, closingIndex)) {
    const match = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "name" && !name) name = value;
    if (key === "description" && !description) description = value;
  }

  if (!name || !description) return null;

  const body = lines.slice(closingIndex + 1).join("\n").replace(/^\n+/, "");
  return { name, description, body };
}

/**
 * Replace every `$ARGUMENTS` occurrence in `body` with `args`. An empty `args` resolves
 * to an empty string, never left as literal unresolved text (FR-006, FR-007).
 */
export function substituteArguments(body: string, args: string): string {
  return body.split("$ARGUMENTS").join(args);
}

/**
 * Scan `baseDir` one level deep (`<baseDir>/<name>/SKILL.md`) and return the valid skills
 * found there. A missing `baseDir`, an unsafe path, or a malformed file are all handled by
 * skipping (with a warning to stderr for the latter two) rather than throwing (FR-009,
 * FR-011).
 */
export function discoverSkillsFrom(
  baseDir: string,
  sourceId: Skill["source"]
): Map<string, Skill> {
  const skills = new Map<string, Skill>();

  let entryNames: string[];
  try {
    entryNames = readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // Directory doesn't exist (or isn't readable) — zero skills from this source, no error.
    return skills;
  }

  for (const name of entryNames) {
    const filePath = resolveSkillPath(baseDir, name);
    if (!filePath) {
      console.error(`Warning: Skipping skill "${name}" in ${baseDir} — path escapes the skills directory`);
      continue;
    }
    if (!existsSync(filePath)) continue; // not every subdirectory is a skill

    try {
      const content = readFileSync(filePath, "utf-8");
      const parsed = parseSkillFile(content);
      if (!parsed) {
        console.error(`Warning: Skipping malformed skill file ${filePath} (missing frontmatter name/description)`);
        continue;
      }
      skills.set(name, {
        name,
        frontmatterName: parsed.name,
        description: parsed.description,
        body: parsed.body,
        source: sourceId,
        filePath,
      });
    } catch (e) {
      console.error(`Warning: Failed to read skill file ${filePath}: ${(e as Error).message}`);
    }
  }

  return skills;
}

/**
 * Merge skill maps in ascending precedence order — a later map's entry overwrites an
 * earlier map's entry for the same name. Callers pass lower-precedence sources first
 * (FR-005; contracts/repl-command-contract.md).
 */
export function mergeSkillSources(...maps: Map<string, Skill>[]): Map<string, Skill> {
  const merged = new Map<string, Skill>();
  for (const map of maps) {
    for (const [name, skill] of map) {
      merged.set(name, skill);
    }
  }
  return merged;
}

export type ResolvedCommand =
  | { kind: "builtin"; builtinName: "clear" | "exit" | "quit" }
  | { kind: "skill"; skill: Skill; args: string }
  | { kind: "none" };

/**
 * Resolve a REPL line against the built-in commands and the discovered-skills map, per
 * contracts/repl-command-contract.md's resolution order:
 *   1. Exact built-in match (`/clear`, `/exit`, `/quit` — no arguments, never overridable)
 *   2. `/skill:<name>` — always reachable, bypasses the reserved-name check entirely
 *   3. Bare `/<name>` — refused if `<name>` is a reserved built-in name (FR-005a), even if
 *      it didn't exactly match step 1 (e.g. "/exit foo" is not a valid built-in invocation,
 *      but it must still not fall through to a same-named skill)
 *   4. Anything else → { kind: "none" } — caller falls back to today's default behavior.
 */
export function resolveCommand(input: string, skills: Map<string, Skill>): ResolvedCommand {
  if (input === "/clear" || input === "/exit" || input === "/quit") {
    return { kind: "builtin", builtinName: input.slice(1) as "clear" | "exit" | "quit" };
  }

  if (!input.startsWith("/")) return { kind: "none" };

  const spaceIndex = input.indexOf(" ");
  const command = spaceIndex === -1 ? input : input.slice(0, spaceIndex);
  const args = spaceIndex === -1 ? "" : input.slice(spaceIndex + 1);
  const token = command.slice(1);

  if (token.startsWith("skill:")) {
    const skill = skills.get(token.slice("skill:".length));
    return skill ? { kind: "skill", skill, args } : { kind: "none" };
  }

  if (RESERVED_COMMAND_NAMES.has(token)) {
    return { kind: "none" };
  }

  const skill = skills.get(token);
  return skill ? { kind: "skill", skill, args } : { kind: "none" };
}
