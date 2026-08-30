# Research: Command Autocomplete and Tab Completion UX

All items below were resolved during planning; none remain as `NEEDS CLARIFICATION` — the spec's clarification pass already fixed the UX-level ambiguities (FR-009 dismissal policy, FR-011 debounce policy, FR-006 Tab cycling, FR-013 silent-disable fallback, description display). This file covers the remaining implementation-level decisions.

## Decision 1: Autocomplete mechanism — readline `completer` + lightweight keypress shim, not a full TUI library

**Decision**: Use Node.js `readline.createInterface({ completer })` for Tab completion and a small `readline.emitKeypressEvents` + `process.stdin.on("keypress")` shim for arrow-key navigation, Escape dismissal, and suggestion rendering. Do not add `ink`, `blessed`, `inquirer`, `enquirer`, or any external TUI dependency.

**Rationale**: The spec already assumes the existing `readline.createInterface({ terminal: true })` REPL (src/index.ts). `readline`'s built-in `completer(line)` is the standard, zero-dependency Tab-completion hook — it receives the current buffer and returns `[matches, line]`. For Suggestion-list display and arrow-key cycling, a keypress listener that inspects the in-flight buffer (`rl.line`) and writes ANSI lines below the prompt is sufficient and avoids replacing the readline instance or reimplementing line editing. Keeping the solution inside the existing module preserves Constitution Principles I (minimalism), V (stdout/stderr separation — readline's output channel is `process.stdout` as terminal control, not the agent's scripted stdout stream), and the Technology & Compatibility Constraints' "stay minimal" bar — the same rationale that led 001 to hand-roll frontmatter parsing rather than add `js-yaml`.

**Alternatives considered**:
- *Full TUI framework (`ink`/`blessed`)* — rejected: overkill for "show a filtered list below the prompt + Tab/arrow navigation"; would force replacing the readline REPL entirely, increase bundle size, and risk Principle I.
- *Prompt library (`inquirer`/`enquirer`)* — rejected: these own the entire prompt lifecycle and assume single-question flows; they don't compose with a long-lived REPL that also dispatches skills and free-form prompts on the `"line"` event.
- *Custom raw-mode stdin handling without readline* — rejected: reimplements line editing, history, and cursor movement that readline already provides correctly.

## Decision 2: Debounce strategy — single trailing timer (20–30 ms), queued final state only

**Decision**: Wrap suggestion computation in a debounced function with a 25 ms trailing delay (spec's 20–30 ms window). Each new keystroke resets the timer; only the last buffer state within the window triggers filtering and re-render. No leading emission, no intermediate renders.

**Rationale**: Directly implements FR-011 as clarified: "Queue updates and show only final state after brief debounce period — no intermediate displays." The filter itself (`registry.filter(prefix)`) is O(n) over < 100 strings and takes < 1 ms, so the debounce is not about compute cost but about avoiding flicker from rendering stale prefixes while the user is still typing rapidly. 25 ms is chosen as the midpoint of the spec's 20–30 ms range — fast enough to feel instant (≈ 2 frames at 60 fps) but long enough to coalesce burst typing.

**Alternatives considered**:
- *No debounce (render on every keystroke)* — rejected: violates FR-011 clarification; risks visible flicker on fast typing.
- *Throttle with leading emission* — rejected: would flash stale intermediate suggestion lists, exactly what the clarification says to avoid.
- *Longer debounce (100+ ms)* — rejected: would violate SC-002 (suggestions within 50 ms).

## Decision 3: Extensible UX framework — tiny `UXComponent` interface with exclusive-focus lifecycle

**Decision**: Define a minimal `UXComponent` interface in `src/ux.ts`:

```ts
interface UXComponent {
  readonly id: string;
  wantsInput(line: string): boolean;   // does this component care about the current buffer?
  render(state: AutocompleteState): void;
  handleKey(key: Key): boolean;        // true = consumed
  dismiss(): void;
}
```

A small `UXManager` holds the registered components and enforces exclusive focus: at most one component is "active" at a time. When a new component activates (e.g., a future permission prompt calls `uxManager.activate(promptComponent)`), the currently active autocomplete component is dismissed automatically (FR-009). When the prompt completes and `uxManager.deactivate(promptComponent)` is called, autocomplete may restore if the buffer still `wantsInput` (spec's "can restore if user returns to same input state"). Input handling, display rendering, and application logic are separate modules (FR-010): `ux.ts` owns the lifecycle, `autocomplete.ts` owns matching/rendering, `index.ts` owns wiring.

**Rationale**: Satisfies FR-009 and FR-010 and US3's "clear extension points" without introducing a plugin system, event bus, or config file. Adding a new interactive component (permission prompt, clarifying question, sub-agent picker) is: implement `UXComponent`, register it with `UXManager`, done — no change to `index.ts`'s `"line"` dispatch or readline setup beyond registration. Keeps the gluing code in `index.ts` to a few lines (create manager, register autocomplete component), consistent with Principle I's "new concern gets its own file" precedent (001's `skills.ts`).

**Alternatives considered**:
- *No abstraction — bake autocomplete directly into `index.ts`* — rejected: violates FR-009/FR-010 and makes US3 impossible without later refactoring; duplicates keyboard handling for each future component.
- *Heavier plugin/hook system with config file* — rejected: violates Principle IV (no config files) and is disproportionate for a < 100-command REPL.

## Decision 4: Rendering strategy — ANSI below the prompt, non-destructive to existing output

**Decision**: Render the suggestion list *below* the current prompt line using `readline` cursor helpers (`readline.cursorTo`, `readline.clearLine`/`clearScreenDown` or manual `\x1b[K` / `\x1b[2K`) and `rl.output.write` (which is wired to `process.stdout` as terminal control). The prompt line and any prior `console.log`/`process.stdout.write` model output above it are not overwritten (FR-012). Selected item is highlighted with inverse video (`\x1b[7m` / `\x1b[27m`) plus an arrow prefix (`› `). Descriptions are truncated to `terminalColumns - commandLength - padding` using `process.stdout.columns` (falls back to 80 when unavailable). On `Escape`, `Backspace` past `/`, or component dismissal, the suggestion block is cleared with `clearScreenDown` from the prompt line.

**Rationale**: Implements FR-007, FR-012, SC-005. Writing through `rl.output` ensures readline's own cursor bookkeeping stays correct. Clearing from the prompt line down avoids the flicker that a full-screen redraw would cause. Inverse video is the most portable ANSI highlight and matches common CLI conventions (e.g., `fzf`, `gh`).

**Alternatives considered**:
- *Render inline (ghost text) inside the prompt line* — rejected: collides with readline's own line editing and cursor position; truncates badly on narrow terminals.
- *Use an alternate screen or full-screen library* — rejected: replaces the scrollback history the user expects from a REPL.

## Decision 5: Terminal compatibility fallback — silent disable on any render or detection failure

**Decision**: Before activating autocomplete, check `process.stdout.isTTY && process.stdin.isTTY`. If false (piped, non-interactive, or `NO_COLOR`-like env considered at rendering time), skip wiring the completer/keypress handler entirely — zero behavior change. At runtime, wrap every `render()` and `handleKey()` body in try/catch. On any exception (ANSI write failed, `columns` unreadable, terminal doesn't support escape codes), call `uxManager.disable(componentId)` which removes the completer and keypress listener, clears any rendered block, logs `Warning: Autocomplete disabled: <reason>` to `process.stderr` (FR-013, `console.error`), and leaves the REPL fully functional for manual typing.

**Rationale**: Directly implements FR-013 as clarified ("Disable autocomplete silently, log to stderr"). The same "degrades gracefully, original capability stays usable" pattern already used for skill loading (malformed skill → skip with warning, other skills still work) and for custom tools (failed import → warning, other tools still work).

**Alternatives considered**:
- *Try to detect ANSI support ahead of time via terminfo* — rejected: over-engineered for a REPL that already works without autocomplete; runtime try/catch is sufficient and simpler.
- *Fall back to plain-text list on the next line without ANSI* — rejected: the clarification explicitly chose "Disable autocomplete silently, log to stderr" over "Fallback to plain text list"; honoring that choice keeps this feature consistent with the spec's intent.

## Decision 6: Matching and completion semantics — prefix match on canonical names, Tab cycles without longest-common-prefix step

**Decision**: The command registry is the concatenation of built-in names (`clear`, `exit`, `quit`) and discovered skill names (keys of the `skills` map, which already deduplicates and respects `.ii/skills` > `.claude/skills` precedence + reserved-name shadowing per `resolveCommand`). Suggestions are those whose canonical name starts with `tokenWithoutSlash` case-sensitively (matching `resolveCommand`'s case-sensitive lookup; command names in this repo are lowercase kebab-case). The completer returns hits sorted lexicographically (stable, deterministic). Tab cycles through hits one-by-one (spec's "Cycle through matches one-by-one with repeated Tab presses"), updating `rl.line` and `rl.cursor` via `rl.write`/`rl.line` assignment. Arrow Down/Up moves the highlight without completing; Enter completes the highlighted item if any, otherwise submits the line normally.

**Rationale**: Implements FR-002/FR-003/FR-006 as clarified and matches the existing `resolveCommand` semantics exactly, so autocomplete never suggests a name that `resolveCommand` would not then dispatch. Cycling (not longest-common-prefix completion) is the spec's chosen behavior per clarification. Sorting gives a stable order that matches user expectation for discovery (FR-001).

**Alternatives considered**:
- *Case-insensitive matching* — rejected: command names are not case-ambiguous; case-sensitive avoids surprising extra matches.
- *Longest-common-prefix Tab completion* — rejected: the clarification explicitly chose cycling.
- *Fuzzy/substring matching* — rejected: out of scope (spec says "starting with what I typed"; assumption says "argument/parameter autocomplete is out of scope").

## Decision 7: Where the code lives — `src/autocomplete.ts` + `src/ux.ts`, `src/agent.ts` untouched

**Decision**: `src/autocomplete.ts` owns the pure logic: `buildCommandRegistry(skills) → CommandEntry[]`, `filterByPrefix(entries, prefix) → CommandEntry[]`, `truncateDescription(desc, maxWidth)`, `renderSuggestions(state)` / `clearSuggestions()`, debounced wrapper, and the `AutocompleteComponent implements UXComponent`. `src/ux.ts` owns the framework: `UXComponent`, `UXManager` (register/activate/dismiss/deactivate, exclusive focus, key delegation). `src/index.ts` changes are limited to: building the registry from `skills` + built-ins, constructing `UXManager`, registering the autocomplete component, wiring `completer` and keypress delegation, and tearing down on `rl.close`.

**Rationale**: Enforces Constitution Principles I and III — the core loop stays at ~80 lines and untouched; UX concerns are isolated in readable, single-purpose modules. Mirrors 001's structure where `skills.ts` was introduced as a sibling rather than folding skill dispatch into `agent.ts` or `index.ts`'s dispatch block.

**Alternatives considered**:
- *Single file `src/repl.ts` or merge into `src/index.ts`* — rejected: `index.ts` would grow past its current ~150 lines toward an unreviewable size, mixing REPL wiring with autocomplete and framework code.
- *Fold into `src/skills.ts`* — rejected: conflates skill discovery/persistence with interactive UX; skills has no terminal or key-handling responsibility.

## Decision 8: Testing approach — manual verification via `quickstart.md`

**Decision**: Same as 001: no test framework is introduced. Validation is via runnable manual scenarios in `quickstart.md`, each mapped to the spec's acceptance criteria and FRs, plus the standard `npm run build` / `npm run dev` gates from Development & Review Workflow.

**Rationale**: The project still has no test runner (`package.json` has no `test` script); introducing one is an orthogonal governance decision, not a side effect of this feature. Manual steps are sufficient for < 100 commands and for verifying visual/behavioral properties (highlight, debounce, silent fallback) that unit tests would not meaningfully cover without a terminal emulator harness.

**Alternatives considered**:
- *Add vitest/jest + ink testing library* — rejected as out of scope, same rationale as 001 Decision 6.
