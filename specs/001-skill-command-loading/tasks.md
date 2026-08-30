---

description: "Task list template for feature implementation"
---

# Tasks: Skill Command Loading

**Input**: Design documents from `/specs/001-skill-command-loading/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: No automated test tasks are included — the project has no test runner today
(research.md, Decision 6) and the spec does not request TDD. Verification is done via the
manual scenarios in `quickstart.md`, referenced as tasks within each story below.

**Organization**: Tasks are grouped by user story to enable independent implementation and
testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project (per plan.md's Structure Decision): all changes live in `src/skills.ts`
(new) and `src/index.ts` (modified). No `tests/` directory exists or is introduced.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create `src/skills.ts` with the `Skill` and `SkillSource` TypeScript types from
  data-model.md (no discovery/parsing logic yet — types only)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core parsing/discovery primitives that every user story needs. No user story
is reachable from the REPL until this phase is done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Implement a path-safe resolution helper in `src/skills.ts` that rejects any
  `<skills-dir>/<name>/SKILL.md` path resolving outside its own skills directory, per
  research.md Decision 3 and constitution Principle II
- [X] T003 Implement `parseSkillFile(content): { name, description, body } | null` in
  `src/skills.ts` — hand-rolled frontmatter extraction (no YAML dependency) per
  contracts/skill-file-format.md and research.md Decision 1; returns `null` for any file
  missing the `---`/`name`/`description`/`---` shape (FR-002, FR-009)
- [X] T004 Implement `substituteArguments(body, args): string` in `src/skills.ts` —
  replaces every `$ARGUMENTS` occurrence with `args`, or with an empty string when `args`
  is empty (FR-006, FR-007)
- [X] T005 Implement `discoverSkillsFrom(baseDir, sourceId): Map<string, Skill>` in
  `src/skills.ts` — scans `baseDir` one level deep (`<baseDir>/<name>/SKILL.md`), uses
  T002/T003, and skips + emits a `console.error` warning for any file that fails to parse
  or read, without throwing (FR-009, FR-011); returns an empty map if `baseDir` doesn't
  exist at all

**Checkpoint**: Parsing and single-directory discovery work and are ready to be wired into
the REPL. Nothing is invocable from `ii` yet.

---

## Phase 3: User Story 1 - Run a Skill as a Slash Command (Priority: P1) 🎯 MVP

**Goal**: Typing `/<skill-name>` (or `/skill:<skill-name>`) at the `ii` prompt runs a
skill discovered under `.ii/skills/`, with arguments substituted, built-in commands always
safe, and any unmatched input falling through exactly as it does today.

**Independent Test**: Place a single valid `SKILL.md` under `.ii/skills/<name>/`, start
`ii`, type `/<name> some input`, and confirm the skill's instructions run (using `ii`'s own
tools) instead of the line being treated as a literal question.

### Implementation for User Story 1

- [X] T006 [US1] In `src/index.ts`'s `rl.on("line", ...)` handler, parse any line starting
  with `/` into a leading command token (up to the first whitespace) and a trailing `args`
  string, per research.md Decision 4 / contracts/repl-command-contract.md
- [X] T007 [US1] In `src/index.ts`, check the command token against the built-in set
  (`clear`, `exit`, `quit`) **before** any skill lookup, so a skill can never shadow a
  built-in under its bare name (FR-005a, contracts/repl-command-contract.md step 1)
- [X] T008 [US1] In `src/index.ts`, call `discoverSkillsFrom(".ii/skills", "ii-native")`
  once at startup (no environment variable or opt-in required — FR-012) and hold the
  result in a name→`Skill` lookup map used by the REPL
- [X] T009 [US1] In `src/index.ts`, resolve `/skill:<name>` (strip the prefix, look up
  directly) and bare `/<name>` (look up after the built-in check in T007) against the map
  from T008; on a match, substitute arguments via `substituteArguments` (T004) and submit
  the result through the existing `agent.prompt(...)` call as an ordinary turn — no new,
  isolated call (FR-001, FR-013, contracts/repl-command-contract.md steps 2–3)
- [X] T010 [US1] In `src/index.ts`, confirm any `/`-prefixed line that matches neither a
  built-in nor a discovered skill falls through unchanged to today's default
  (`agent.prompt(input)`) — no error, no new branch swallows it (FR-010)
- [X] T011 [US1] In `src/index.ts`, log a startup message to stderr reporting how many
  skills were discovered and from where (e.g. `Loaded N skill(s) from .ii/skills`),
  mirroring the existing `II_TOOLS_DIR` loading message style (FR-008)
- [X] T012 [US1] Manually verify quickstart.md Scenarios A, B, C, and G (skill with
  arguments, skill with no arguments, unmatched command, malformed skill file) by
  authoring a temporary test skill under `.ii/skills/`

**Checkpoint**: User Story 1 is fully functional and independently testable — skills
placed under `.ii/skills/` are invocable, with correct fallback and built-in behavior.

---

## Phase 4: User Story 2 - Reuse Existing Claude Code Skills (Priority: P2)

**Goal**: This repository's existing `.claude/skills/speckit-*` files become invocable
from `ii` without modification, and a project with neither skills directory sees zero
behavior change.

**Independent Test**: With no `.ii/skills/` present, start `ii` in a repo that has
`.claude/skills/<name>/SKILL.md`, invoke `/<name>`, and confirm it runs using the
unmodified file.

### Implementation for User Story 2

- [X] T013 [US2] In `src/index.ts`, call
  `discoverSkillsFrom(".claude/skills", "claude-compatible")` at startup alongside T008's
  call (FR-004, FR-012 — no opt-in required here either)
- [X] T014 [US2] In `src/index.ts`, merge the two maps from T008/T013 into the single
  lookup map used by dispatch (a straightforward union is sufficient for this story —
  collision correctness is made explicit in User Story 3)
- [X] T015 [US2] Update the startup message from T011 to report both sources' counts
  (e.g. `Loaded N skill(s): X from .ii/skills, Y from .claude/skills`)
- [X] T016 [US2] Manually verify quickstart.md Scenarios D and E (an existing
  `.claude/skills/speckit-tasks` skill runs unmodified; a project with neither directory
  shows zero behavior change) using this repository's own `speckit-*` skills

**Checkpoint**: User Stories 1 AND 2 both work — this repository's ten `speckit-*` skills
are now invocable from `ii`.

---

## Phase 5: User Story 3 - Author `ii`-Native Skills (Priority: P3)

**Goal**: When the same skill name exists under both sources, the `.ii/skills/` version
deterministically wins, every time — not order- or timing-dependent.

**Independent Test**: Create the same skill name under both `.ii/skills/<name>/` and
`.claude/skills/<name>/` with different bodies, invoke `/<name>`, and confirm the
`.ii/skills/` body is the one that runs, repeatably.

### Implementation for User Story 3

- [X] T017 [US3] In `src/index.ts`, replace T014's straightforward union with an
  explicitly ordered merge — apply the `claude-compatible` map first, then the
  `ii-native` map second, so an `ii-native` entry always overwrites a same-named
  `claude-compatible` entry (FR-005, SC-003)
- [X] T018 [US3] Manually verify quickstart.md Scenario F (same-named skill under both
  sources) more than once to confirm the `.ii/skills/` version wins deterministically, not
  by chance of iteration order
- [X] T019 [US3] Manually verify quickstart.md Scenario H (built-in collision:
  `/clear` still runs the built-in, `/skill:clear` still reaches the colliding skill) now
  that both sources are wired together

**Checkpoint**: All user stories are independently functional; the full requirement set
(FR-001 through FR-013) is covered.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final regression pass across all three stories

- [X] T020 [P] Document the new skill-loading capability in `AGENTS.md` (discovery
  locations, the `/skill:` disambiguation form, the precedence rule), matching the
  existing "Extensibility Changes" documentation style
- [X] T021 [P] Update `README.md`'s Usage section to mention skill invocation alongside
  the existing `/clear` and `/exit` commands
- [X] T022 [P] Add trust-boundary language for auto-discovered skills (no opt-in gate,
  full agent privileges once invoked) to the project's docs, mirroring the existing
  custom-tool trust-boundary note in `tools/README.md`, per constitution Principle II
- [X] T023 Run `npm run build` and walk quickstart.md Scenarios A–I end-to-end once more
  as a final regression pass
- [X] T024 Confirm `src/agent.ts`'s line count is unchanged from before this feature
  (constitution Principle I gate — the core loop must never have been touched)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational completion; T013/T014 build on the
  same `src/index.ts` region T006–T011 introduced, so in practice follows US1
- **User Story 3 (Phase 5)**: Depends on US2 (T014) existing — it replaces T014's merge
  with the precedence-correct version, so it cannot start before US2 is done
- **Polish (Phase 6)**: Depends on all three stories being complete

### Parallel Opportunities

Because nearly every implementation task edits one of two shared files
(`src/skills.ts` in Setup/Foundational, `src/index.ts` in US1/US2/US3), true parallelism
is limited within those phases — this is expected for a feature this size and consistent
with the constitution's minimalism principle (one small module, one small dispatch site).
The only real parallel opportunity is in Polish:

```bash
# Launch all three documentation tasks together (different files, no shared state):
Task: "Document skill-loading in AGENTS.md"
Task: "Update README.md Usage section"
Task: "Add trust-boundary language to project docs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T005) — CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T006–T012)
4. **STOP and VALIDATE**: run quickstart.md Scenarios A, B, C, G independently
5. This alone delivers a working `/skill:<name>` and `/<name>` mechanism against
   `.ii/skills/` — usable even before Claude Code compatibility is added

### Incremental Delivery

1. Setup + Foundational → parsing/discovery primitives ready
2. Add User Story 1 → validate → the mechanism works end-to-end (MVP)
3. Add User Story 2 → validate → this repo's existing `.claude/skills/speckit-*` skills
   become invocable with zero file changes
4. Add User Story 3 → validate → cross-source precedence is deterministic, not incidental
5. Polish → docs updated, full regression pass, constitution gate re-confirmed

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Every task above lists the FR(s) or contract section it implements — cross-check against
  spec.md before marking a task done
- Commit after each phase checkpoint, not after every individual task
- `src/agent.ts` must never appear as a file path in any task above — if a future task
  seems to need it, stop and re-check against the Constitution Check in plan.md first
