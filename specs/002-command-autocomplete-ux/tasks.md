# Tasks: Command Autocomplete and Tab Completion UX

**Input**: Design documents from `/specs/002-command-autocomplete-ux/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No automated test runner exists in this project (`package.json` has no `test` script; research.md Decision 8 reuses 001's manual-verification precedent). Tasks below do not include generated test-file tasks; verification is via `quickstart.md` scenarios run manually plus `npm run build` / `npm run dev` gates per constitution Development & Review Workflow.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tools/` at repository root (per plan.md Structure Decision)
- New modules: `src/autocomplete.ts`, `src/ux.ts`
- Modified: `src/index.ts` (REPL wiring only; `src/agent.ts` stays untouched per constitution Principle I)
- Docs: `specs/002-command-autocomplete-ux/` (plan.md, research.md, data-model.md, contracts/, quickstart.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify baseline and prerequisites before any code changes

- [X] T001 Verify baseline builds cleanly with `npm run build` and `npm run dev` starts without error in `src/index.ts` / `src/agent.ts` (no code change; gate per constitution)
- [X] T002 Confirm existing command sources are discoverable: check `src/skills.ts` exports `discoverSkillsFrom`/`mergeSkillSources`/`RESERVED_COMMAND_NAMES` and built-in descriptions available for registry construction
- [X] T003 Check extension hooks: confirm `.specify/extensions.yml` does not exist or has no `before_tasks`/`after_tasks` hooks that would alter task generation (already verified as absent; no-op if absent)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data structures and framework that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Create `CommandEntry` type and `buildCommandRegistry(skills: Map<string, Skill>): CommandEntry[]` in `src/autocomplete.ts` (derived per data-model.md: built-ins `clear`/`exit`/`quit` + merged skills map, sorted lexicographically, deduplicated by name, implements `CommandRegistry` derivation)
- [X] T005 [P] Create `Key` type and `UXComponent` interface + `UXManager` class skeleton in `src/ux.ts` per `contracts/ux-component-contract.md` (id, wantsInput, handleKey, render, dismiss, optional restore; registry/active/disabled invariants; register/activate/deactivate/disable/onKeypress/onLineChange/onResize signatures with try/catch isolation)
- [X] T006 Create TTY pre-flight gating helper `isAutocompleteEnabled(): boolean` in `src/ux.ts` or `src/autocomplete.ts` (checks `process.stdout.isTTY && process.stdin.isTTY`; when false, autocomplete wiring is skipped entirely — FR-013 pre-flight, contracts/autocomplete-contract.md Fallback)
- [X] T007 Implement `filterByPrefix(entries: CommandEntry[], prefix: string): CommandEntry[]` and `getSlashPrefix(line: string, cursor: number): string | null` helpers in `src/autocomplete.ts` (case-sensitive `startsWith`, lexicographic already sorted, token is last `/`-prefixed substring up to cursor; returns null when `wantsInput` is false — contract Input shape, FR-001)
- [X] T008 Implement `truncateDescription(desc: string, maxWidth: number): string` and `availableWidth` helper in `src/autocomplete.ts` (uses `process.stdout.columns ?? 80`, `columns - qualifiedName.length - 3`, appends `…` when clipped, never wraps — contract Display, data-model.md AutocompleteState)
- [X] T009 Wire minimal `src/index.ts` scaffolding: build `CommandEntry[]` registry from discovered `skills` + built-ins after existing skill discovery, construct `UXManager`, register placeholder autocomplete component (no rendering yet), gate wiring behind `isAutocompleteEnabled()` so piped/non-TTY behavior is byte-for-byte identical (FR-010, FR-013)

**Checkpoint**: Foundation ready — `npm run build` passes, `CommandEntry` registry builds correctly, `UXManager` skeleton compiles, and non-TTY `echo "/speck" | npm run dev` shows zero behavior change

---

## Phase 3: User Story 1 - Command Discovery Through Autocomplete (Priority: P1) 🎯 MVP

**Goal**: Typing a `/`-prefixed prefix shows matching commands with truncated descriptions in real time; non-`/` input is inert; list updates as the user types and never shows when nothing matches

**Independent Test**: Type `/spe` and verify all commands starting with `/spe` appear below the prompt with descriptions (quickstart.md Scenario A); type `/zzz` and verify no block appears (Scenario B); extend `/spec` → `/speckit-p` and verify narrowing (Scenario C); type `hello` and verify no autocomplete triggers (Scenario D). Delivers immediate value by making command discovery possible without memorizing names.

### Implementation for User Story 1

- [X] T010 [P] [US1] Implement suggestion rendering `renderSuggestions(state: AutocompleteState, rl: readline.Interface)` in `src/autocomplete.ts` (writes block below prompt via `rl.output` / `process.stdout` as terminal control, one row per match as `qualifiedName + " - " + truncatedDescription`, does not overwrite prompt or prior `agent.prompt` stdout output — FR-002, FR-007 highlight prep, FR-012, contract Display)
- [X] T011 [P] [US1] Implement `clearSuggestions(rl: readline.Interface)` in `src/autocomplete.ts` (clears block via `readline.clearScreenDown` / `\x1b[J` from prompt line, restores cursor — contract Display Clearing, SC-005)
- [X] T012 [US1] Implement `AutocompleteState` management and debounced recomputation in `src/autocomplete.ts` (state fields `prefix`/`matches`/`selectedIndex`/`visible` per data-model.md; 25 ms trailing debounce per research.md Decision 2 / FR-011; on buffer change recompute prefix→matches, reset `selectedIndex=-1`, set `visible=matches.length>0 && wantsInput`; empty matches → no render, no placeholder — FR-003, FR-011, SC-002)
- [X] T013 [US1] Implement `AutocompleteComponent implements UXComponent` in `src/autocomplete.ts` (`id="autocomplete"`, `wantsInput` true iff `/` token at cursor, `render` delegates to `renderSuggestions`, `dismiss` delegates to `clearSuggestions`, try/catch on every `render`/`handleKey` path that calls `UXManager.disable("autocomplete")` + `console.error("Warning: Autocomplete disabled: ...")` on failure — FR-001, FR-008, FR-013, data-model.md UXComponent lifecycle)
- [X] T014 [US1] Wire `AutocompleteComponent` to `UXManager` and `readline` in `src/index.ts` (create component with registry + `rl`, `ux.register(autocomplete)`, delegate `rl.on("keypress")` / line-buffer change events to `ux.onKeypress`/`ux.onLineChange` with debounce, delegate `process.stdout.on("resize")` to `ux.onResize` for re-truncation — FR-003, FR-010, contracts/ux-component-contract.md Manager invariants)
- [X] T015 [US1] Implement dismissal on Escape, Backspace past `/`, and cursor leaving `/` token in `src/autocomplete.ts` (`handleKey` for `escape`, `onLineChange` when `wantsInput` becomes false → `dismiss()` + `visible=false` + `selectedIndex=-1`, block cleared without altering buffer — FR-008, contract Dismissal)
- [X] T016 [US1] Implement empty-state and non-slash inertness in `src/autocomplete.ts` (`matches.length===0` → no block rendered; `wantsInput===false` → `visible=false` with zero stdout/stderr side effects and zero behavior change for piped input — FR-001, US1 AC2, contract Empty state, data-model.md Relationships 3)
- [X] T017 [US1] Implement terminal-width truncation and highlight preparation in `src/autocomplete.ts` (descriptions truncated to `columns - qualifiedName.length - 3` with `…`; highlight row at `selectedIndex` uses `\x1b[7m`/`\x1b[27m` + `› ` marker when selected; fallback to 80 when `columns` unavailable — FR-002 with truncation, FR-007, contract Display highlight)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently — typing `/speck` shows filtered skill + built-in suggestions below the prompt with descriptions (Scenarios A–D, J, N), debounced to 25 ms (Scenario J), silent on non-`/` and empty matches

---

## Phase 4: User Story 2 - Tab Completion for Efficient Command Entry (Priority: P1)

**Goal**: Tab completes the buffer to the matching command (single) or cycles one-by-one through multiple matches; arrow keys move highlight without completing; Enter inserts the selection

**Independent Test**: With `/spe` typed, press Tab and verify completion to first match (Scenario E); with multiple matches press Tab repeatedly and verify cycling in sorted order (Scenario F); with `/speck` use ArrowDown/ArrowUp to move highlight without mutating buffer (Scenario G); with a highlighted item press Enter and verify the command is inserted and dispatched (Scenario H).

### Implementation for User Story 2

- [X] T018 [US2] Implement single-match Tab completion `handleKey` for `tab` when `matches.length===1` in `src/autocomplete.ts` (replace `/`-token at cursor with `matches[0].qualifiedName`, place cursor after completed text + trailing space, hide suggestion block; `matches.length===0` → no-op — FR-004, contract Tab completion Single match)
- [X] T019 [US2] Implement multi-match Tab cycling in `src/autocomplete.ts` (`tab` cycles `selectedIndex=(selectedIndex+1)%matches.length`, completes buffer to `matches[selectedIndex].qualifiedName` on each press, block stays visible with new highlight tracked; sorted order is registry order — FR-006, FR-004 multiple, contract Tab completion Multiple matches)
- [X] T020 [US2] Implement ArrowUp/ArrowDown navigation in `src/autocomplete.ts` (`handleKey` for `up`/`down` moves `selectedIndex` cyclically, re-renders highlight only, does not mutate `rl.line`; `selectedIndex===-1` → ArrowDown selects 0, ArrowUp selects last; consumed only when `visible`, otherwise falls through to readline default — FR-005, contract Arrow-key navigation)
- [X] T021 [US2] Implement visual highlight for selected suggestion in `src/autocomplete.ts` (row at `selectedIndex` rendered with inverse video `\x1b[7m`/`\x1b[27m` + `› ` prefix per contract Display; other rows plain — FR-007, contract Display Highlight)
- [X] T022 [US2] Implement Enter-with-selection handling in `src/autocomplete.ts` + `src/index.ts` (when `selectedIndex>=0 && visible`, Enter completes buffer to `matches[selectedIndex].qualifiedName` before emitting `"line"`; when `selectedIndex===-1` submit as typed without inserting completion — US2 AC3, data-model.md Enter transition, Scenario H)
- [X] T023 [US2] Wire readline `completer` function in `src/index.ts` as alternative/fallback Tab path (completer receives `line`, returns `[matches.map(m=>m.qualifiedName), line]` for `line` at `/` position; used only when `isAutocompleteEnabled()` and keeps completion mutation consistent with `handleKey` path — FR-004, research.md Decision 1)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently — full autocomplete + Tab cycle + arrow navigation + highlight + Enter-insert (Scenarios E–H), with SC-003 keystroke reduction and SC-002 50 ms latency met

---

## Phase 5: User Story 3 - Extensible UX Framework for Future Features (Priority: P2)

**Goal**: The autocomplete interaction layer exposes a defined `UXComponent` extension point so future components (permission prompts, clarifying questions, sub-agent selectors) can reuse input interception, rendering, and keyboard navigation without modifying core REPL dispatch

**Independent Test**: Code-review `src/ux.ts` confirming `UXManager.activate(other)` dismisses active autocomplete and `deactivate(other)` restores it when buffer still `wantsInput`; adding a new `implements UXComponent` class and `ux.register(newComponent)` requires no change to `readline` setup or the `"line"`→`resolveCommand`→`agent.prompt` dispatch (quickstart.md Scenario K, contracts/ux-component-contract.md).

### Implementation for User Story 3

- [X] T024 [P] [US3] Finalize `UXManager` exclusive-focus lifecycle in `src/ux.ts` (`register`/`activate`/`deactivate`/`disable` with correct ordering: activate dismisses prior active, deactivate probes registry in registration order for restoration, disabled set never re-activated — contracts/ux-component-contract.md Invariants, FR-009)
- [X] T025 [P] [US3] Implement `onKeypress` delegation and error isolation in `src/ux.ts` (when `active!==null` forward to `active.handleKey`; when `active===null` probe `wantsInput`→activate→forward; every component call wrapped in try/catch that routes to `disable(component.id)` + single `console.error` to stderr without propagating to readline or `Agent` history — FR-013 runtime, Principle III)
- [X] T026 [US3] Implement `onLineChange` restoration probing in `src/ux.ts` (when `active!==null && !active.wantsInput(line,cursor)` → `dismiss` + null; when `active===null` probe for newly eligible component; `deactivate(c)` with `active===c` → `dismiss` + null + probe for restoration per FR-009 "can restore if user returns to same input state")
- [X] T027 [US3] Enforce separation of concerns across `src/ux.ts` / `src/autocomplete.ts` / `src/index.ts` in alignment with `contracts/ux-component-contract.md` (`ux.ts` owns lifecycle, `autocomplete.ts` owns matching/rendering/debounce, `index.ts` owns wiring and registry construction only; no new concern leaks into `src/agent.ts` which stays untouched — FR-010, Constitution Principle I, research.md Decision 7)
- [X] T028 [US3] Implement silent-disable guarantee and manager teardown in `src/ux.ts` + `src/index.ts` (`disable(id)` removes keypress delegation for that id, clears block, emits one stderr warning, never re-enables even if later `wantsInput` would match; `rl.on("close")` tears down listeners — FR-013, contract Fallback, contract guarantees "Registering a component has no visible side effect until wantsInput...")
- [X] T029 [US3] Add inline documentation / code comments illustrating the extension example in `src/ux.ts` (hypothetical `PermissionPrompt implements UXComponent` usage pattern per contracts/ux-component-contract.md Extension example, so Scenario K code review can confirm adding a prompt reuses `UXManager` without touching `index.ts` `"line"` dispatch)

**Checkpoint**: At this point, all user stories should be independently functional — autocomplete, Tab/arrow completion, and the extensible framework with dismiss/restore are all working (Scenario K), `src/agent.ts` is still at ~133 lines untouched

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, visual polish, and validation across all stories

- [X] T030 Handle terminal resize re-rendering in `src/autocomplete.ts` and `src/ux.ts` (listen `process.stdout.on("resize")`, re-truncate descriptions to new `columns` when `visible`; if width unreadable, degrade via same silent-disable try/catch — Edge Cases "terminal resize", Scenario M)
- [X] T031 Handle long command names and special characters in `src/autocomplete.ts` (long qualifiedName + description never wraps, description truncated with `…` to stay within width; non-ASCII / special-character command names matched case-sensitively via `startsWith` without throwing — Edge Cases "very long command" + "special characters", Scenario M.2)
- [X] T032 Handle identical-prefix disambiguation and Backspace widening in `src/autocomplete.ts` (e.g., `/spec` vs `/speckit` both appear under `/spec` prefix; backspacing from `/speckit-p` to `/spec` widens matches again via debounced recompute — Edge Cases "identical prefixes", Scenario C)
- [X] T033 Implement pipes / non-TTY zero-change guarantee and stdout/stderr separation audit in `src/index.ts` + `src/ux.ts` + `src/autocomplete.ts` (piped `echo "/speck" | npm run dev` and `printf "/clear\n/exit\n" | npm run dev` show no completer, no keypress listener, no `Autocomplete disabled` warning, and input dispatches correctly; verify all autocomplete rendering goes through `rl.output` not agent `stdout`, and all warnings go through `console.error` stderr — Scenario N, Scenario L, Constitution Principle V)
- [X] T034 Run full `quickstart.md` validation (Scenarios A–N) from `specs/002-command-autocomplete-ux/quickstart.md` and fix any failures (covers FR-001–FR-013, SC-001–SC-005, debounce 25 ms within 50 ms, no flicker/artifacts, Escape/Backspace/cursor-leave dismissal, silent-disable fallback)
- [X] T035 Verify constitution gates: `npm run build` passes with no TypeScript errors, `npm run dev` starts cleanly, `src/agent.ts` is byte-for-byte unchanged, autocomplete modules perform no I/O at import time (explicit init in `isMainModule` block), and fresh-repo / non-TTY piped runs match quickstart.md Scenario N (Constitution Development & Review Workflow, all Principles, research.md Decisions 7–8)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories (defines `CommandEntry`, `Key`, `UXComponent`/`UXManager`, filtering, truncation, TTY gating, index scaffolding)
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed sequentially in priority order (P1 → P1 → P2) or, if staffed, US1 and US2 in parallel after Foundational
  - US2 (Tab/arrow/Enter) depends on US1's `matches`/`visible`/`renderSuggestions`/`clearSuggestions` being available — complete US1 first if running solo
  - US3 (framework lifecycle polish) depends on US1/US2 having exercised `AutocompleteComponent` as the first `UXComponent` consumer
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1) — Command Discovery**: Can start after Foundational (Phase 2) — no dependencies on other stories; owns debounced filtering, suggestion block rendering, empty-state, non-slash inertness, dismiss-on-Escape/Backspace/cursor-leave
- **User Story 2 (P1) — Tab Completion**: Can start after Foundational (Phase 2) but is **sequentially dependent on US1 completion** (it consumes `matches`/`selectedIndex`/`visible` and `renderSuggestions` from US1). Independently testable once US1 is done; do not start in parallel without US1's T010–T017 merged.
- **User Story 3 (P2) — Extensible UX Framework**: Can start after Foundational (Phase 2); benefits from US1/US2 having provided the first real `UXComponent` to validate the `UXManager` lifecycle, but is independently reviewable via contract. Should be implemented after US1 so its `activate`/`deactivate`/`disable` invariants can be exercised against a real component.

### Within Each User Story

- For US1: prefix/filter helpers (already in Foundational) → rendering/clearing → state/debounce → component → wiring → dismissal/empty-state/width Polish within story
- For US2: single-tab → cycle-tab → arrows → highlight → Enter
- For US3: manager lifecycle → delegation/error isolation → restoration → separation enforcement → silent-disable + teardown → documented extension example
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel: T001, T002, T003 are independent checks (different files, no dependencies) — but T002/T003 can be omitted as they are verification, not file writes
- All Foundational tasks marked [P] can run in parallel: T004 and T005 create different files (`src/autocomplete.ts` vs `src/ux.ts`) with no inter-dependency; T007 and T008 can start once T004 has defined `CommandEntry` but are parallelizable with each other
- Once Foundational phase completes, US1 internal tasks T010 and T011 can run in parallel (render vs clear are complementary methods on same file but with no ordering dependency)
- US1 internal tasks T013–T017 are sequential (component → wiring → dismissal)
- US2 is sequential on US1; US3 tasks T024 and T025 can run in parallel (manager lifecycle vs delegation are same file `src/ux.ts` but testable independently and flagged [P] for advisory parallelism — in practice serialize per file to avoid merge conflicts)
- Different user stories can be worked on in parallel by different team members only if US1 is complete first; otherwise US2 blocks (see dependency above)
- Polish tasks T030, T031, T032 can run in parallel (different concerns/edge cases), then T033 and T034 sequentially

---

## Parallel Example: User Story 1

```bash
# Phase 2 foundational — build registry + UX skeleton in parallel:
Task: "Create CommandEntry type and buildCommandRegistry in src/autocomplete.ts"  # T004
Task: "Create Key type and UXComponent/UXManager skeleton in src/ux.ts"            # T005

# Phase 3 US1 — rendering helpers in parallel:
Task: "Implement renderSuggestions in src/autocomplete.ts"                        # T010
Task: "Implement clearSuggestions in src/autocomplete.ts"                         # T011

# Phase 6 Polish — edge cases in parallel:
Task: "Handle terminal resize re-rendering in src/autocomplete.ts and src/ux.ts"  # T030
Task: "Handle long names and special characters in src/autocomplete.ts"            # T031
Task: "Handle identical-prefix disambiguation and Backspace widening in src/autocomplete.ts" # T032
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003) — verify `npm run build` clean
2. Complete Phase 2: Foundational (T004–T009) — `CommandEntry`, registry builder, `UXComponent`/`UXManager` skeleton, TTY gating, `filterByPrefix`/`getSlashPrefix`/`truncateDescription`, index scaffolding
3. Complete Phase 3: User Story 1 (T010–T017) — rendering, state + 25 ms debounce, component, wiring, dismissal, inertness
4. **STOP and VALIDATE**: Run quickstart.md Scenarios A–D, J, N plus `npm run build` + manual `npm run dev` typing. Verify suggestions appear filtered with truncated descriptions, update in real time debounced to 25 ms, no list on `/zzz` or non-`/` input, Escape/Backspace dismiss, and piped input shows zero change (SC-002 analogue, FR-010, Constitution Principle I still holds: `src/agent.ts` untouched)
5. Deploy/demo if ready — command discovery alone already delivers SC-001/SC-002 value

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 (Discovery) → Test independently (Scenarios A–D, J, N, M.1) → Deploy/Demo (MVP!)
3. Add User Story 2 (Tab/Arrows/Enter) → Test independently (Scenarios E–H) → Deploy/Demo — now SC-003 keystroke reduction is achievable
4. Add User Story 3 (Extensible Framework) → Code-review Scenario K, verify `activate`/`deactivate`/`restore` lifecycle, confirm new component can be added without touching `index.ts` dispatch → Deploy/Demo
5. Polish (Phase 6) → Terminal resize, long-name wrapping, identical-prefix, special-char, pipes, full quickstart.md A–N sweep, constitution gates (T030–T035) → Final validation
6. Each story adds value without breaking previous stories; risk is contained to `src/autocomplete.ts`/`src/ux.ts`/`src/index.ts` diff

### Parallel Team Strategy

With multiple developers (note US2 depends on US1, so adjust accordingly):

1. Team completes Setup + Foundational together (one dev owns `src/autocomplete.ts` registry/filter/truncation T004/T007/T008, another owns `src/ux.ts` + gating T005/T006, then together land T009 index scaffolding)
2. Once Foundational is done:
   - Developer A: User Story 1 (T010–T017) — rendering, debounce, component, wiring, dismissal
   - Developer B: Prepares User Story 3 framework polish (T024–T027) which has fewer direct US1 file dependencies and can advance the `UXManager` lifecycle in parallel with US1's `autocomplete.ts` work (advisory — coordinate on `src/ux.ts` to avoid file conflicts, or serialize)
   - Developer C: Waits for US1 to land, then takes User Story 2 (T018–T023) — Tab cycle, arrows, highlight, Enter
3. Polish phase (T030–T035) is done together after US1+US2+US3 are merged; Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies (parallelizable)
- [Story] label maps task to specific user story for traceability (US1, US2, US3)
- Each user story should be independently completable and testable (Independent Test in each Phase header) via quickstart.md Scenarios A–N
- There is no automated test runner in this project — verification is manual per quickstart.md plus `npm run build` gate (research.md Decision 8)
- Verify `npm run build` passes after each phase; `src/agent.ts` must remain untouched and at ~133 lines (constitution Principle I)
- Commit after each task or logical group; research.md Decisions 1–7 justify dependency choices
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence; US2's sequential dependency on US1 is explicitly documented and intentional
- Autocomplete display and diagnostics MUST use `rl.output` (terminal control) and `console.error` (stderr) respectively — never agent stdout — per contracts and constitution Principle V
- All matching is case-sensitive `startsWith` on canonical `name` without leading `/`; no fuzzy matching (contract Input shape, research.md Decision 6)
