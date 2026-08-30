# Implementation Plan: Command Autocomplete and Tab Completion UX

**Branch**: `002-command-autocomplete-ux` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-command-autocomplete-ux/spec.md`

## Summary

Add interactive autocomplete to the `ii` REPL: when the user types a `/`-prefixed prefix (e.g. `/speck`), the CLI shows matching slash commands (built-ins `/clear`/`/exit`/`/quit` plus discovered skills from `.ii/skills/` and `.claude/skills/`) with truncated descriptions, supports Tab cycling and arrow-key navigation, and dismisses/restores via Escape or focus changes. The UX layer is built as an extensible framework — autocomplete is the first consumer of a small `UXComponent` abstraction so future interactive elements (permission prompts, clarifying questions, sub-agent selectors) can reuse the same input interception, rendering, and keyboard-navigation machinery without touching core REPL dispatch. No new runtime dependencies; `src/agent.ts` is untouched; all changes live in a new `src/autocomplete.ts` + `src/ux.ts` (or similar) plus a focused edit to `src/index.ts`'s readline setup.

## Technical Context

**Language/Version**: TypeScript 6.x, Node.js >= 20 (existing project baseline; no change)

**Primary Dependencies**: `@anthropic-ai/sdk` (existing, only LLM client) + Node.js built-ins `node:readline`, `node:readline/promises` if needed, `process.stdout`/`stderr` for ANSI rendering. No new external dependency — readline's `completer` + `readline.emitKeypressEvents` / `process.stdin` keypress handling covers FR-004/FR-005 without pulling in `ink`, `blessed`, `inquirer`, or similar. Hand-rolled debounce + ANSI helpers (same rationale as `src/skills.ts` hand-rolled frontmatter vs. YAML lib — research.md Decision 1 in 001).

**Storage**: N/A — command registry is derived in-memory at startup from the already-discovered skills map (`src/skills.ts`) plus the three built-in names; autocomplete state (matches, selected index, visibility) is ephemeral per keystroke and not persisted.

**Testing**: Manual verification (project has no automated test runner — `package.json` has no `test` script, same precedent as 001's research.md Decision 6). Validation scenarios in `quickstart.md` cover each FR and edge case. `npm run build` must pass (`tsc` clean) and `npm run dev` must start without error per Development & Review Workflow.

**Target Platform**: Node.js CLI REPL. Unix-like terminals (Linux/macOS) and Windows Terminal with ANSI support. Degrades gracefully when `NO_COLOR`, non-TTY, or ANSI write fails — autocomplete disables silently and logs to stderr (FR-013).

**Project Type**: Single project (CLI tool) — existing `src/` + `tools/` layout; no frontend/backend/mobile split.

**Performance Goals**: Suggestions appear within 50 ms of keystroke (SC-002); rapid typing is debounced to 20–30 ms showing only final state (FR-011); zero visual artifacts — no flicker, no prompt overwrite (SC-005, FR-012); Tab reduces keystrokes per command ≥ 40% (SC-003).

**Constraints**:
- Constitution Principle I: `src/agent.ts` MUST NOT be touched and MUST stay ≤ ~100 lines — all REPL/input/UX work lives outside it.
- Principle II: no new filesystem or shell surface; autocomplete reads only the in-memory command registry (already validated at discovery time).
- Principle III: a rendering or key-handling failure MUST NOT crash the process or corrupt `Agent` history — autocomplete errors are caught and downgrade to "disabled silently" (FR-013).
- Principle IV: no config file; no behavior change when no skills exist or when stdin is non-interactive.
- Principle V: autocomplete rendering and diagnostics MUST use stderr (or readline's own output channel), never stdout, to preserve stdout as the scriptable agent-output stream.
- Must work through `readline.createInterface({ terminal: true })` without replacing the readline instance's `"line"` dispatch that already handles built-ins and skill dispatch.

**Scale/Scope**: < 100 commands in any repo (spec Assumption); autocomplete filters a flat list by prefix — O(n) scan is sufficient, no indexing or async lookup needed. One new abstraction (`UXComponent`) plus one concrete implementation (autocomplete); future components reuse it without growing core dispatch.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Radical Minimalism | Does this touch `src/agent.ts` or grow the core loop? Does new REPL/UX code stay small and isolated? | **PASS** — `agent.ts` is untouched. New code lives in dedicated modules (`src/autocomplete.ts` for matching/rendering and `src/ux.ts` or `src/repl-ux.ts` for the `UXComponent` abstraction + key interception). The change to `src/index.ts` is limited to wiring the readline `completer` / keypress handler and providing the command registry to the UX layer. Estimated new code < 200 lines total, each module readable in one sitting. |
| I. Multi-provider clause | Does this introduce provider-specific branching in the core? | **N/A** — no LLM provider surface is involved. |
| II. Safety by Default | Does user input reach a filesystem path or shell via autocomplete? Do outputs have bounded size? Are timeouts preserved? | **PASS** — autocomplete consumes only the already-validated skills map (names already passed `resolveSkillPath` containment checks at discovery time). No new `validatePath` surface. Description truncation reuses the existing "fit to terminal width" rule rather than bypassing `truncateOutput`. No shell or subprocess is added. |
| II. Custom-tool trust boundary | Is the trust model for `II_TOOLS_DIR` / `AGENTS.md` affected? | **PASS** — unchanged; autocomplete does not load or execute tools or skill bodies, only names/descriptions for display. |
| III. Fail Gracefully, Never Corrupt State | Can a rendering/keypress failure crash `ii` or corrupt history? Is there a MAX_ITERATIONS-equivalent guard? | **PASS, with requirement carried forward** — every render path and key handler MUST be wrapped in try/catch that disables autocomplete and logs to stderr on failure (FR-013). Autocomplete state is per-keystroke and isolated from `Agent.history`; errors there cannot corrupt model history. No infinite loop is introduced (debounce is bounded, navigation is bounded by match count). |
| IV. No Feature Creep, Opt-In Extensibility | New config file? Default behavior change? Is extensibility opt-in? | **PASS** — no config file (FR-009's "extension point" is a code-level `UXComponent` interface, not a config format). When no `/`-prefixed input is present or stdin is non-TTY, behavior is byte-for-byte identical to today's REPL. The `UXComponent` registry is opt-in at code level (adding a new component is adding a new module that implements the interface, not changing existing defaults). |
| V. Transparent Text-Based Interface | Hidden capability? Tool interface changed? Stdout/stderr separation preserved? Deduplication? | **PASS** — autocomplete is text-protocol visible (prefix → suggestions → Tab → completed text in line buffer, exactly as a typed completion). No `Tool` interface change. Rendering and the "Rendered N suggestions" / "Autocomplete disabled: ..." diagnostics MUST go to stderr (or via readline's output channel that `readline` itself writes to `process.stdout` as terminal control — not the agent's `process.stdout.write` stream for model output) — the plan documents which channel is used and why, to preserve the scriptability guarantee. Command registry deduplicates by name (skills map already does; built-ins are checked first, same order as `resolveCommand`). |
| Tech Constraints | Node >= 20? `tsc` clean? Symlink-safe? Runtime deps minimal? Module side-effects? | **PASS** — stays Node >= 20, uses only built-in `readline`. No new runtime dependency (justified per "minimal direct imports" rule). `npm run build` with `tsc` is the gate. Symlink handling unchanged. Autocomplete/UX modules MUST NOT perform I/O at import time — initialization is explicit in `src/index.ts`'s `isMainModule` block, same pattern that `AGENTS.md` loading already follows. |

No violations. Complexity Tracking table below is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-command-autocomplete-ux/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── autocomplete-contract.md   # Matching, debounce, display, fallback
│   └── ux-component-contract.md   # UXComponent interface + lifecycle (FR-009/FR-010)
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── agent.ts        # UNCHANGED — core agentic loop, not touched
├── tools.ts        # UNCHANGED
├── types.ts        # UNCHANGED — Tool interface not modified
├── skills.ts       # UNCHANGED (read-only dependency: autocomplete reads the
│                   # discovered skills map + built-in names to build its registry)
├── autocomplete.ts # NEW — pure matching, filtering, description truncation,
│                   # debounced lookup, and ANSI rendering helpers for the
│                   # autocomplete UX component
├── ux.ts           # NEW — small extensible UX framework: UXComponent
│                   # interface, component registry, exclusive-focus management
│                   # (autocomplete dismisses when another component takes focus,
│                   # FR-009), and the keypress → component delegation shim
└── index.ts        # MODIFIED — wires readline completer/keypress handling to
                    # the UX layer, builds the command registry from skills +
                    # built-ins, and passes it to the autocomplete component.
                    # No change to Agent construction or the "line" → skill/
                    # prompt dispatch beyond providing the registry.

tools/               # UNCHANGED
```

**Structure Decision**: Single project (Option 1). This feature adds two focused modules (`autocomplete.ts`, `ux.ts`) and a surgical edit to `index.ts`'s readline setup. No new top-level directories, no project-type change. Mirrors the 001 precedent where a new concern got its own file (`skills.ts`) rather than being folded into `index.ts` or `agent.ts`.

## Complexity Tracking

> No entries — the Constitution Check above found no violations requiring justification.
