# Data Model: Skill Command Loading

No persistent storage is introduced by this feature. The "data model" below describes the
in-memory shapes computed once at `ii` startup from the filesystem (per research.md,
Decision 2) and held for the life of the process.

## Skill

A named, reusable instruction set invokable as a slash command. Backed by exactly one
`SKILL.md` file on disk.

| Field | Type | Source | Notes |
|---|---|---|---|
| `name` | `string` | Directory name (`<skills-dir>/<name>/SKILL.md`) | **Canonical lookup key.** The directory name is authoritative for invocation, not the frontmatter `name` field — this avoids ambiguity if the two ever disagree. |
| `frontmatterName` | `string` | Frontmatter `name:` field | Required to be present and non-empty for the file to be considered a valid skill (FR-002, FR-009); not used for lookup, only to confirm the file identifies itself as a skill. |
| `description` | `string` | Frontmatter `description:` field | Required, non-empty. Used only for the discovery listing (FR-008); not otherwise interpreted. |
| `body` | `string` | Everything after the closing `---` frontmatter delimiter | May contain `$ARGUMENTS`, substituted at invocation time (FR-006/FR-007). |
| `source` | `"ii-native" \| "claude-compatible"` | Which `SkillSource` produced this entry | Used for precedence resolution (FR-005). |
| `filePath` | `string` | Resolved absolute path to `SKILL.md` | Used only for warning messages when a *different* file at the same name fails to parse; not otherwise exposed. |

**Validation rules** (a candidate file that fails any of these is skipped with a warning,
per FR-009 — it does not become a `Skill`):
- File must contain a well-formed frontmatter block: a `---` line, at least one `key:
  value` line, and a closing `---` line, before any body content.
- Frontmatter must include a non-empty `name` and a non-empty `description`.
- File must be readable (no permission error, no I/O error).

**Lifecycle**: Recomputed from scratch on every `ii` startup (research.md, Decision 2).
Skills are not mutated, cached across processes, or persisted. There is no update/delete
operation — the filesystem is the only source of truth, and changes take effect the next
time `ii` starts.

## SkillSource

A conventional, fixed-location directory `ii` scans for skills.

| Field | Type | Notes |
|---|---|---|
| `id` | `"ii-native" \| "claude-compatible"` | Fixed set of exactly two values (FR-003, FR-004). |
| `baseDir` | `string` | `.ii/skills` or `.claude/skills`, resolved relative to `process.cwd()`. |
| `precedence` | `number` | `ii-native` > `claude-compatible`. Higher wins on name collision (FR-005). |

## ReservedCommandName

Not a stored entity — a fixed, in-code constant set: `{"clear", "exit", "quit"}`.

Used only as a lookup-order rule (FR-005a): when the REPL resolves a bare `/<name>`
command, this set is checked *before* the skill map. A name in this set always resolves to
the built-in behavior; the skill (if any) with that same name is only reachable via the
`/skill:<name>` form (research.md, Decision 4).

## Relationships & resolution order

For a bare `/<name>` command:
1. Is `<name>` in `ReservedCommandName`? → run the built-in. (Skill, if any, ignored here.)
2. Else, is `<name>` a key in the discovered-skills map? → run that `Skill`.
3. Else → fall through unchanged to today's default (literal prompt), per FR-010.

For a `/skill:<name>` command:
1. Look `<name>` up directly in the discovered-skills map (bypassing step 1 above
   entirely) → run it if found.
2. Else → not found; treated the same as any unmatched skill name (FR-010's fallback).

The discovered-skills map itself is built by scanning `SkillSource`s in ascending
precedence order and letting a later (higher-precedence) entry overwrite an earlier one
for the same `name` — this is what makes `ii-native` win over `claude-compatible` (FR-005).
