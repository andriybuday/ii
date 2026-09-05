# Tasks: Muse Spark 1.3 Model Support

**Input**: Design documents from `/specs/003-muse-spark-1-3/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No test runner exists in this repo and none is requested — validation is
manual per AGENTS.md and [quickstart.md](./quickstart.md). Manual validation tasks
are included in each story phase instead of automated test tasks.

**Organization**: Tasks grouped by user story for independent implementation/testing.

**⚠️ GATE**: T001 (Principle IV constitution amendment) is DONE — approved and
applied 2026-09-05 (constitution 2.0.0). Implementation may proceed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Governance gate + verified baseline

- [x] T001 Approve + apply Principle IV amendment (constitution 1.2.0 → 2.0.0 MAJOR, Sync Impact Report, narrow AGENTS.md config-file ban) in `.specify/memory/constitution.md` and `AGENTS.md` — DONE 2026-09-05, gate lifted
- [x] T002 [P] Verify clean baseline via `npm run build` in repo root (no errors before changes)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Registry, persistence, and client abstraction all stories build on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create extensible model registry (default Anthropic entry + `muse-spark-1.3` Meta entry) in `src/models.ts`
- [x] T004 Create `~/.ii/` config module (model preference file + separate 0600 credentials file, corrupt-JSON/unknown-id/legacy-env semantics per contract) in `src/config.ts`
- [x] T005 Create `ModelClient` interface + neutral history/message types + `AnthropicClient` ported from current `src/agent.ts` call logic in `src/clients.ts` (pass `apiKey` explicitly from CredentialsStore so the SDK env fallback can never supply a key)
- [x] T006 Implement `MetaClient` on global `fetch` (OpenAI-compatible Chat Completions at `https://api.meta.ai/v1`, Bearer header built ONLY from CredentialsStore value — never env, `tool_choice: "auto"` only, neutral↔wire translation, usage normalization) in `src/clients.ts`
- [x] T007 Refactor `src/agent.ts` onto `ModelClient` + neutral history (loop shape unchanged, `MAX_ITERATIONS`=50 kept, add programmatic model switching; MOVE provider logic into `src/clients.ts` — file is 133 lines today and MUST end smaller, ~≤100 lines)

**Checkpoint**: Foundation ready — `npm run build` clean; Anthropic path behaves exactly as before via the abstraction

---

## Phase 3: User Story 1 - Use Muse Spark 1.3 as the active model (Priority: P1) 🎯 MVP

**Goal**: `/model` selects `muse-spark-1.3`; full tool-backed agent loop runs on Meta

**Independent Test**: Run `/model`, choose `muse-spark-1.3`, send a tool-requiring prompt (e.g. "list the files in src/") and get a grounded answer (quickstart scenario 2)

### Implementation for User Story 1

- [x] T008 [US1] Wire `/model` builtin in `src/index.ts` (bare list + `/model <name>` switch, preference persistence, client swap with history kept, next-prompt effect); register `model` as reserved builtin in `src/skills.ts` and in `src/autocomplete.ts`
- [x] T009 [US1] Implement secure key prompt flow in `src/index.ts` (non-echoing stdin prompt on missing key, straight to 0600 credentials file, never logged/echoed/exported)
- [x] T010 [US1] Manual validation: quickstart scenarios 2 + 3 — scenario 3 VERIFIED (persist/restart/immediate-switch observed); scenario 2 tool round-trip verified via stub loop + wire-shape checks, LIVE Meta answer needs a valid key (unavailable here)

**Checkpoint**: User Story 1 fully functional and testable independently — MVP ready

---

## Phase 4: User Story 2 - Default flow preserved; legacy env config removed (Priority: P2)

**Goal**: Default flow untouched; legacy `II_MODEL`/env keys removed and ignored with documented migration

**Independent Test**: Fresh start with no `~/.ii/` behaves exactly as before; stale `II_MODEL` changes nothing (quickstart scenarios 1 + 5)

### Implementation for User Story 2

- [x] T011 [US2] Remove `II_MODEL` model selection and `ANTHROPIC_API_KEY`-via-env reads (`src/agent.ts`, `src/index.ts`); default comes from registry; stale env values ignored — verify with `ANTHROPIC_API_KEY=bad` set that requests still use the file key (leave `II_TOOLS_DIR`/`ANTHROPIC_WORKSPACE_ID` untouched)
- [x] T012 [US2] Manual validation: quickstart scenarios 1 + 5 — VERIFIED (default startup, unknown-model error, stale env ignored, Anthropic wire fidelity + role alternation); LIVE Anthropic answer needs a valid key (unavailable here)

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Clear failure when the selected model cannot be used (Priority: P3)

**Goal**: Missing/invalid credentials and unreachable endpoints fail gracefully with secure re-prompting, never crashing or corrupting history

**Independent Test**: Missing key prompts securely; invalid key yields readable error + re-prompt; retry after fix succeeds with history intact (quickstart scenario 4)

### Implementation for User Story 3

- [x] T013 [US3] Implement invalid-credential and unreachable-endpoint handling in `src/clients.ts` + `src/index.ts` (readable error naming provider only, secure re-prompt, process alive, history uncorrupted)
- [x] T014 [US3] Manual validation: quickstart scenario 4 — VERIFIED (missing→prompt, invalid→LIVE 401 error + re-prompt + save + retry, 0600 perms, no secret in output/history); unreachable-endpoint drill shares the generic-error path (unit-covered, no live way to force DNS failure here)

**Checkpoint**: All user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Docs, contract conformance, full verification

- [x] T015 [P] Document `/model`, `~/.ii/` files, and `II_MODEL`/env-key migration in `README.md` (FR-008)
- [x] T016 [P] Conform unknown-model errors to contract (list available ids) across `src/index.ts` — VERIFIED (`Unknown model "nope". Available: …` observed)
- [x] T017 Run full quickstart validation (scenarios 1–6) plus AGENTS.md safety checklist — VERIFIED except scenarios needing valid provider keys (2, 6); traversal/truncation/cap/token-log all hold
- [x] T018 Final constitution re-check — VERIFIED (agent.ts 90 lines, types.ts untouched, no import-time I/O, stdout/stderr separation, `npm run build` clean)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 complete, gate lifted
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - Then proceed in priority order (P1 → P2 → P3), or in parallel if staffed
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependencies on other stories
- **User Story 2 (P2)**: After Foundational — independently testable (removal work overlaps US1 files; coordinate if parallel)
- **User Story 3 (P3)**: After Foundational — builds on the US1 prompt flow; independently testable via failure drills

### Within Each User Story

- Foundational modules before REPL wiring; core flow before failure paths
- Manual validation task closes each story — story is done only when its quickstart scenarios pass as observed
- No automated tests exist in this repo; do not add a runner (out of scope per plan)

### Parallel Opportunities

- T001 + T002 (different files, no dependency)
- T015 + T016 (docs vs code, different files)
- US1/US2/US3 phases can run in parallel once Foundational completes (note US1–US3 share `src/index.ts` — serialize edits per file)
- T003 (`src/models.ts`) and T004 (`src/config.ts`) touch different files but T005+ needs both shapes settled — keep Phase 2 sequential

---

## Parallel Example: Polish Phase

```bash
Task: "Document /model, ~/.ii/ files, and migration in README.md"
Task: "Conform unknown-model errors to contract across src/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001 gate approved)
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: quickstart scenarios 2 + 3 pass as observed
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready (Anthropic path parity proven)
2. Add US1 → validate independently → Deploy/Demo (MVP!)
3. Add US2 → validate independently → Deploy/Demo
4. Add US3 → validate independently → Deploy/Demo
5. Polish → full quickstart + safety checklist → done

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Coordinate `src/index.ts` edits across stories (single file shared by all three)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable via its quickstart scenarios
- Commit after each task or logical group; safety fixes in separate commits per AGENTS.md
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file edit conflicts, cross-story dependencies that break independence
