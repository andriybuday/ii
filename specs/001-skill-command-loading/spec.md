# Feature Specification: Skill Command Loading

**Feature Branch**: `001-skill-command-loading`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "I would like to add skill loading capability. We want to be able to load a skill like "speckit-specify" and then have command appear in the harness like /speckit-specify. IF there is industry agent agnostic way of doing so, let's make that priority, if it has to be agent specific we can use ".ii" folder and then "skills" subfolder. We should also allow to load ".claude/skills" so if someone used claude we should be able to load those skills as well."

## Clarifications

### Session 2026-08-30

- Q: Should `ii` require an explicit opt-in step (like an environment variable) before it will scan `.ii/skills/` or `.claude/skills/` for skills, or should it discover and allow running them automatically just because those directories exist in the working directory? → A: Auto-discover automatically, no opt-in gate — the typed `/<name>` command is the trust signal (matches `AGENTS.md` precedent).
- Q: If a discovered skill's name collides with a built-in command (`/clear`, `/exit`, `/quit`), should the built-in always win, should the skill win, or should the skill be refused at startup? → A: Built-ins always win under the bare name, but the skill is not dropped — it stays reachable under the `/skill:<name>` prefix (e.g. `/skill:clear`), reusing the `skill:` namespace convention already referenced by this repo's own `SKILL.md` files.
- Q: Should a skill's instructions be appended into the same ongoing conversation history the user has been chatting in, or should each skill invocation start from a fresh, isolated context? → A: Continue in the same ongoing conversation history — consistent with how every other prompt in `ii` already behaves, and with how major agentic coding harnesses (this session's own Claude Code behavior being direct proof) run skills inline rather than in an isolated context per invocation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a Skill as a Slash Command (Priority: P1)

As an `ii` user, I want to type `/<skill-name>` (optionally followed by arguments) at the
prompt and have `ii` carry out that skill's instructions using its existing tools, so that
multi-step workflows (like Spec Kit's specify/plan/tasks/implement commands) can be driven
from inside `ii` instead of being manually pasted in every time.

**Why this priority**: This is the entire point of the feature — without it, none of the
other stories matter. It must work end-to-end before anything else is worth building.

**Independent Test**: Place a single valid skill file in a discovery location, start `ii`,
type `/<that-skill-name> some input`, and confirm `ii` follows the skill's instructions
(using its own tools) rather than treating the line as a literal question.

**Acceptance Scenarios**:

1. **Given** a skill named `speckit-specify` exists in a discovery location, **When** the
   user types `/speckit-specify add a login page`, **Then** `ii` loads that skill's
   instructions, substitutes `add a login page` into them, and acts on them using its own
   tools rather than replying to the literal text.
2. **Given** a skill exists and takes no meaningful arguments, **When** the user types
   `/<skill-name>` with nothing after it, **Then** the skill still runs, with any
   arguments placeholder in its instructions resolved to empty rather than left as
   unresolved literal text.
3. **Given** no skill is registered under the name the user typed, **When** the user
   types `/does-not-exist`, **Then** `ii` behaves exactly as it does today for any
   unrecognized input starting with `/` (sent through as a literal prompt) — no error,
   no crash.

---

### User Story 2 - Reuse Existing Claude Code Skills (Priority: P2)

As a user of a repository that already has Claude Code skills installed under
`.claude/skills/`, I want `ii` to discover and run those same skill files without me
rewriting or duplicating them, so the same repo works with either agent.

**Why this priority**: This repository already has ten `speckit-*` skills sitting in
`.claude/skills/`. Cross-agent reuse is the concrete, immediate payoff and doesn't require
authoring anything new — it should work as soon as this feature ships.

**Independent Test**: With no `.ii/skills/` directory present, start `ii` in a repo that
has `.claude/skills/<name>/SKILL.md`, invoke `/<name>`, and confirm it runs using the
unmodified Claude Code skill file.

**Acceptance Scenarios**:

1. **Given** `.claude/skills/speckit-tasks/SKILL.md` exists and `.ii/skills/` does not,
   **When** the user types `/speckit-tasks`, **Then** `ii` runs that skill's instructions
   unchanged.
2. **Given** a repository with no `.claude/skills/` and no `.ii/skills/` directory,
   **When** `ii` starts, **Then** it starts and behaves exactly as it does today — no
   error, no warning, no change in output.

---

### User Story 3 - Author `ii`-Native Skills (Priority: P3)

As an `ii` user or project maintainer, I want a place to author skills that is native to
`ii` (not borrowed from another agent's directory convention), so `ii`-specific skills
aren't forced to live inside a Claude-Code-branded folder.

**Why this priority**: Useful for projects that adopt `ii` without Claude Code, but it's
additive polish on top of Stories 1 and 2 — those two already deliver the core value.

**Independent Test**: Place a skill only under `.ii/skills/<name>/SKILL.md` (no
`.claude/skills/` equivalent), invoke `/<name>`, and confirm it runs.

**Acceptance Scenarios**:

1. **Given** a skill exists only under `.ii/skills/<name>/SKILL.md`, **When** the user
   types `/<name>`, **Then** `ii` runs it.
2. **Given** a skill with the same name exists under both `.ii/skills/` and
   `.claude/skills/`, **When** the user types `/<name>`, **Then** the version under
   `.ii/skills/` is the one that runs.

### Edge Cases

- What happens when a skill file exists but is malformed (unreadable, or missing the
  fields needed to identify it as a skill)? `ii` MUST skip that one file with a warning
  and continue — it must not stop `ii` from starting or from handling other input.
- What happens when the same skill name is discovered in more than one location? The
  `ii`-native location always wins (see User Story 3, Scenario 2).
- What happens when a discovered skill's name is the same as an existing built-in command
  (`/clear`, `/exit`, `/quit`)? The built-in always wins under the bare name — it MUST NOT
  be overridable — but the skill is not silently dropped; it stays reachable under the
  `/skill:<name>` prefix (e.g. `/skill:clear`).
- What happens when a user types a `/`-prefixed line that matches neither a discovered
  skill nor an existing built-in command (`/clear`, `/exit`, `/quit`)? Today's behavior is
  unchanged: the line is sent through as a literal prompt.
- What happens when a discovery location (`.ii/skills/` or `.claude/skills/`) doesn't
  exist at all? `ii` MUST treat that as "zero skills from that location" and continue
  without error — most repositories will have neither directory.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to invoke a discovered skill from the `ii` prompt by
  typing `/<skill-name>` optionally followed by free-text arguments. Every discovered skill
  MUST also always be reachable via the namespaced form `/skill:<skill-name>`, whether or
  not its bare name collides with anything — this keeps the collision rule in FR-005a a
  special case of one general, predictable lookup rule rather than a one-off exception.
- **FR-002**: System MUST recognize skills authored as a plain markdown file with a YAML
  frontmatter block (at minimum a `name` and a `description` field) plus a body — the same
  portable, vendor-neutral convention already used by this project's existing
  `.claude/skills/*/SKILL.md` files — so a skill authored once needs no vendor-specific
  runtime to be read by another agent.
- **FR-003**: System MUST discover skills from an `ii`-native directory,
  `.ii/skills/<skill-name>/SKILL.md`, resolved relative to the current working directory.
- **FR-004**: System MUST also discover skills from `.claude/skills/<skill-name>/SKILL.md`,
  resolved relative to the current working directory, so existing Claude Code skill
  installations run without modification.
- **FR-005**: When a skill name is discovered in both locations, the `.ii/skills/` version
  MUST take precedence over the `.claude/skills/` version.
- **FR-005a**: When a discovered skill's name collides with an existing built-in command
  (`/clear`, `/exit`, `/quit`), the built-in command MUST always win under the bare name —
  it MUST NOT be overridable by a skill. The colliding skill MUST still be reachable,
  namespaced under the `/skill:<name>` prefix (e.g. `/skill:clear`), so it is never silently
  dropped.
- **FR-006**: When a skill is invoked, System MUST substitute the text the user typed
  after the skill name into the skill's instructions before submitting them, following the
  same `$ARGUMENTS` placeholder convention already used by the existing skill files in this
  repository.
- **FR-007**: When a skill is invoked with no trailing arguments, System MUST still run the
  skill with the arguments placeholder resolved to an empty value rather than left as
  unresolved literal text.
- **FR-008**: System MUST make the set of currently discovered skills' names knowable to
  the user (e.g., surfaced at startup or on request), mirroring the existing pattern used
  for custom tools ("Loaded N custom tool(s) from ...").
- **FR-009**: If a skill file cannot be read or is missing the fields required to identify
  it as a skill, System MUST skip that file, emit a warning, and continue — it MUST NOT
  crash or prevent other valid skills or input from working.
- **FR-010**: For any `/`-prefixed input that does not match a discovered skill name and
  does not match an existing built-in command, System MUST continue treating it exactly as
  it does today (passed through as a literal prompt) — projects with no skills installed
  MUST see no change in behavior.
- **FR-011**: System MUST function without error in a project that has neither
  `.ii/skills/` nor `.claude/skills/` present.
- **FR-012**: System MUST NOT require any explicit opt-in (such as an environment
  variable) before scanning `.ii/skills/` or `.claude/skills/` — their mere presence in the
  working directory is sufficient for discovery; the user's typed `/<skill-name>` invocation
  is itself the trust decision, since (unlike custom tools) a skill never runs unless the
  user explicitly names it.
- **FR-013**: When a skill is invoked, System MUST submit the skill's instructions into the
  same ongoing conversation history as any other prompt, rather than starting an isolated
  or fresh context for that turn — a skill invocation is an ordinary turn in the session,
  not a special one.

### Key Entities

- **Skill**: A named, reusable instruction set that can be invoked as a slash command.
  Has a name (used as the invocation keyword), a short description, and a body of
  instructions that may contain an arguments placeholder. Backed by one file on disk.
- **Skill Source**: A conventional, fixed-location directory that `ii` scans for skills.
  Two are in scope for this feature — the `ii`-native source and the Claude Code-compatible
  source — each with a fixed precedence relative to the other.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any of this repository's existing Claude Code skills (the ten `speckit-*`
  commands) can be invoked from the `ii` prompt without editing the skill's file content.
- **SC-002**: A project with no skill directories at all shows zero difference in `ii`'s
  startup output or runtime behavior compared to before this feature existed.
- **SC-003**: When a skill name collides across both discovery locations, the correct one
  (the `ii`-native one) is the one that runs, every time — the outcome is deterministic,
  not order-dependent.
- **SC-004**: A single malformed skill file never prevents `ii` from starting or from
  correctly running any other valid skill or plain prompt.
- **SC-005**: A user can find out which skills are currently available without inspecting
  the filesystem themselves.

## Assumptions

- The plain-markdown-with-YAML-frontmatter file convention already used by
  `.claude/skills/*/SKILL.md` (`name` + `description` + body) is treated as the portable,
  agent-agnostic skill representation for this feature — it requires no vendor-specific
  runtime to parse, which is the most "industry agent-agnostic" option available without
  inventing a new format. Frontmatter fields beyond `name`/`description` (e.g.
  `argument-hint`, `disable-model-invocation`) are not required to be enforced by this
  feature; unrecognized fields are ignored.
- Running a skill means: the skill's instructions (with arguments substituted) are
  submitted to the model as the user's turn, and the model carries out the described steps
  using `ii`'s existing tools (`read_file`, `write_file`, `edit_file`, `bash`, `list_dir`).
  This feature does not introduce any new tool types.
- Skill turns accumulate in the same session history as everything else (FR-013), so
  repeated skill invocations in a long session grow the token count the same way a long
  plain conversation would. This is treated as an existing, accepted characteristic of
  `ii` sessions in general (mitigated today only by `/clear`), not a new problem introduced
  by this feature, and no additional trimming/summarization is in scope here.
- Only user-typed slash-command invocation is in scope. The model does not autonomously
  decide to run a skill on its own initiative (unlike tool-calling) — this keeps the
  feature a bounded addition to the REPL input-handling rather than a new
  always-considered, token-costing capability on every turn.
- Only `.ii/skills/` and `.claude/skills/` are in scope as discovery locations for this
  feature. A configurable, arbitrary third-party skills directory (analogous to
  `II_TOOLS_DIR` for custom tools) is out of scope and may be a follow-up feature.
- Skill discovery looks one directory level deep (`<skills-dir>/<skill-name>/SKILL.md`);
  nested or multi-level skill namespacing is out of scope.
- Harness-specific conveniences that Claude Code adds around skill invocation (such as
  announcing a skill's base directory) are not required to be replicated — this feature
  only needs to reproduce the core mechanism (discover, name-match, substitute arguments,
  run), not every presentational detail of another agent's UI.
