# Implementation Plan: Skill Command Loading

**Branch**: `001-skill-command-loading` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-skill-command-loading/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Let `ii` users invoke a skill (a plain-markdown instruction file with YAML frontmatter,
following the same convention already used by this repo's `.claude/skills/*/SKILL.md`
files) as a slash command — `/<skill-name> [arguments]` — discovered from an `ii`-native
directory (`.ii/skills/`) and, for compatibility, from `.claude/skills/`. The skill's body
(with `$ARGUMENTS` substituted) is submitted as an ordinary turn in the same conversation
history, and the model carries it out using `ii`'s existing tools. No new tool types, no
new config file format, and `src/agent.ts` (the core loop) is untouched — this lives
entirely in a new `src/skills.ts` module plus a small dispatch addition in the REPL.

## Technical Context

**Language/Version**: TypeScript, Node.js >= 20 (matches the existing project; no change)

**Primary Dependencies**: None added. Frontmatter parsing is hand-rolled (see research.md,
Decision 1) rather than pulling in a YAML library, to keep the dependency list minimal per
the constitution's Technology & Compatibility Constraints.

**Storage**: N/A — skills are discovered from the filesystem (`.ii/skills/`,
`.claude/skills/`) at startup; nothing is persisted by this feature.

**Testing**: Manual verification, matching this project's existing convention (no
automated test runner exists in `package.json` today). Validation steps are captured in
`quickstart.md` and extend the existing AGENTS.md-style checklist.

**Target Platform**: Node.js CLI (the `ii` REPL) — same target as the rest of the project.

**Project Type**: Single project (CLI tool) — matches the existing `src/` + `tools/`
layout; no frontend/backend or mobile split applies.

**Performance Goals**: Not applicable as a numeric target — discovery scans at most a
handful of small files once, at startup. The only measurable bar is SC-002: zero
observable difference in startup time/output for a project with no skill directories.

**Constraints**: Must not grow `src/agent.ts` (Constitution Principle I); must apply the
existing path-traversal discipline (Principle II) to skill-name-derived file paths; must
fail gracefully per-file on malformed skills (Principle III); must not introduce a new
config file format or change default behavior when no skills exist (Principle IV).

**Scale/Scope**: Tiny — this repository currently has ten `speckit-*` skills; expected
scale for any project is low tens of skills, not hundreds.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Radical Minimalism | Does this touch `src/agent.ts` or grow the core loop? | **PASS** — new logic lives in `src/skills.ts` (a sibling to `src/tools.ts`) plus ~10-15 lines in `src/index.ts`'s existing REPL handler; `agent.ts` is untouched. |
| I. Radical Minimalism (multi-provider clause) | N/A — this feature doesn't touch LLM provider integration. | **N/A** |
| II. Safety by Default | Does user input reach a filesystem path? | **PASS, with a requirement carried forward** — a typed skill name is used to build a path (`<skills-dir>/<name>/SKILL.md`); the existing path-validation discipline (reject any resolved path that escapes the skills directory) MUST be applied here too. Captured as a data-model/contract requirement, not a violation. |
| II. Safety by Default (custom-tool trust boundary) | Does this feature match or exceed the existing trust model? | **PASS** — per the ratified clarification (FR-012), skill *content* trust mirrors the already-accepted `AGENTS.md` auto-load precedent (no opt-in gate), which is a spec-level decision already made deliberately, not a constitutional violation; the constitution's custom-tool clause is scoped to `II_TOOLS_DIR`-loaded tools specifically. |
| III. Fail Gracefully, Never Corrupt State | Can a bad skill file crash `ii` or corrupt history? | **PASS** — FR-009 requires per-file try/catch-and-skip with a warning, matching the existing pattern for custom tool loading errors. |
| IV. No Feature Creep, Opt-In Extensibility | Does this add a config file or change default behavior? | **PASS** — no new config file; FR-010/FR-011/SC-002 explicitly require zero behavior change for projects without skill directories. |
| V. Transparent Text-Based Interface | Is this reachable only through a hidden path? | **PASS** — it's a REPL text command, symmetric with `/clear`/`/exit`. Logging (discovered skills, warnings) MUST go to stderr per the existing stdout/stderr separation rule. |
| Tech Constraints | New runtime dependency? | **PASS** — none added (research.md, Decision 1). |

No violations. Complexity Tracking table below is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-skill-command-loading/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── skill-file-format.md
│   └── repl-command-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── agent.ts        # UNCHANGED — the core loop; this feature does not touch it
├── tools.ts         # UNCHANGED — existing custom-tool loading (sibling pattern to skills.ts)
├── skills.ts         # NEW — skill discovery, frontmatter parsing, precedence, prompt-building
├── types.ts          # UNCHANGED
└── index.ts           # MODIFIED — REPL handler gains a small dispatch branch for
                        # "/<name>" and "/skill:<name>" before falling through to the
                        # existing literal-prompt behavior

tools/                 # UNCHANGED — unrelated to this feature (custom tools, not skills)
```

**Structure Decision**: Single project (Option 1). This feature adds exactly one new file
(`src/skills.ts`) and a small, additive change to `src/index.ts`'s existing REPL loop. No
new top-level directories, no new project type.

## Complexity Tracking

> No entries — the Constitution Check above found no violations requiring justification.
