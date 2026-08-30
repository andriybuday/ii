# Research: Skill Command Loading

All items below were resolved during planning; none were left as
`NEEDS CLARIFICATION` (the spec's `/speckit-clarify` pass already resolved the
scope-level ambiguities — this file covers the remaining implementation-level decisions).

## Decision 1: Skill file parsing strategy

**Decision**: Hand-roll a minimal frontmatter extractor — split on the leading and second
`---` delimiter lines, then pull `name:` and `description:` out of the frontmatter block
with simple line-based parsing (strip quotes, take the rest of the line as the value).
Everything else in the frontmatter (e.g. `argument-hint`, `metadata:`, nested keys) is
ignored outright, per the spec's Assumptions.

**Rationale**: FR-002 only requires `name` and `description` to identify a valid skill.
A full YAML parser would need to handle nested maps (`metadata:` has sub-keys in the
existing `.claude/skills/*/SKILL.md` files) for zero functional benefit here. Avoiding the
dependency keeps the Technology & Compatibility Constraints' "stay minimal" bar intact —
this project's only runtime dependency today is `@anthropic-ai/sdk`.

**Alternatives considered**:
- *Add a YAML library (`js-yaml`/`yaml`)* — rejected: correct and more robust, but adds a
  dependency for functionality (nested-object parsing) this feature doesn't need.
- *Invent a simpler, non-YAML header format* — rejected: would break compatibility with
  the existing `.claude/skills/*/SKILL.md` files, defeating User Story 2 entirely.

## Decision 2: Discovery timing (eager vs. lazy)

**Decision**: Scan both `.ii/skills/` and `.claude/skills/` once, eagerly, at `ii` startup
— the same point where `II_TOOLS_DIR` custom tools are already loaded in `src/index.ts`.

**Rationale**: Consistent with the existing precedent; keeps per-line REPL dispatch a
simple in-memory map lookup instead of re-reading disk on every keystroke/command. At the
expected scale (tens of skill files), the one-time startup scan cost is negligible.

**Alternatives considered**:
- *Lazy scan on first `/name` typed, or every invocation* — rejected: reintroduces disk
  I/O latency on the hot path (every command) for no measurable benefit, and complicates
  the "zero difference when no skills exist" guarantee (SC-002) since the check itself
  would need to run on every line instead of being decided once at boot.

## Decision 3: Path-traversal handling for skill names

**Decision**: When resolving `<skills-dir>/<name>/SKILL.md`, apply the same
resolve-and-verify-containment discipline already used for the built-in file tools (per
AGENTS.md's `validatePath()` pattern): the resolved real path must stay within the skills
directory it came from. A name that resolves outside (e.g. via `..` segments) is treated
as "no such skill" — same as any other not-found name (FR-010's fallback), not a crash.

**Rationale**: Constitution Principle II requires this for any file-system operation that
incorporates user input, and a typed skill name is exactly that kind of input.

**Alternatives considered**:
- *Trust the typed name as-is* — rejected: direct violation of Principle II.

## Decision 4: Command grammar

**Decision**: For any REPL line starting with `/`, take the leading token up to the first
whitespace as the candidate command. If that token starts with `skill:`, strip the prefix
and look the remainder up *only* as a skill (bypassing built-ins entirely). Otherwise, look
it up first against built-ins (`clear`, `exit`, `quit`), then against discovered skills.
Everything after the first whitespace is the arguments string substituted for
`$ARGUMENTS`.

**Rationale**: Directly implements FR-001/FR-005a/FR-005 as clarified — built-ins always
win the bare name, every skill is always reachable via `/skill:<name>`, and the parsing
convention matches what this repo's own `SKILL.md` files already reference
(`/skill:speckit-...`).

**Alternatives considered**:
- *A different disambiguation delimiter (e.g. `::`, `@`)* — rejected: no reason to diverge
  from the convention already referenced in-repo; would just be a second thing to learn.

## Decision 5: Where the code lives

**Decision**: New `src/skills.ts` module owns discovery, parsing, precedence resolution,
and prompt-building (an `execute(name, args) → string | undefined` style helper returning
the fully-substituted prompt text, or `undefined` for "not a skill"). `src/index.ts` gains
a small branch in its existing `rl.on("line", ...)` handler that calls into it before
falling through to today's default (`agent.prompt(input)`). `src/agent.ts` is untouched.

**Rationale**: Constitution Principle I's line-count budget is explicitly about
`agent.ts`; this is REPL input-dispatch, a separate concern already modeled by
`tools.ts`'s existence as its own file. Mixing this into `agent.ts` would conflate two
unrelated responsibilities for no benefit.

**Alternatives considered**:
- *Fold dispatch logic into `agent.ts`* — rejected: risks the core-loop line budget and
  conflates REPL-level concerns with the model-facing loop.

## Decision 6: Testing approach

**Decision**: Manual verification, documented as runnable steps in `quickstart.md`,
extending this project's existing AGENTS.md-style manual checklist. No test framework is
introduced by this feature.

**Rationale**: The project has no automated test runner today (`package.json` has no
`test` script, no `vitest`/`jest`/etc. dependency); introducing one is an orthogonal
decision, not something this feature should smuggle in as a side effect.

**Alternatives considered**:
- *Add a test framework now* — rejected as out of scope; a separate, deliberate decision
  for the project to make on its own, not as a byproduct of this feature.
