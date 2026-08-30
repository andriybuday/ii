# Contract: Autocomplete Matching, Display, and Input Handling

This contract formalizes the observable behavior of command autocomplete (US1/US2, FR-001 through FR-008, FR-011 through FR-013). It is the testable complement to data-model.md's `CommandEntry` / `AutocompleteState` shapes and research.md's rendering and debounce decisions. References to `resolveCommand` are to the existing contract in `specs/001-skill-command-loading/contracts/repl-command-contract.md` when invoked (deferred to `"line"` submit), but this contract covers only the pre-submit, in-buffer behavior.

## Input shape

The REPL line buffer is the raw `rl.line` string and `rl.cursor` position. Autocomplete cares only when the cursor is within a `/`-prefixed token:

- A candidate token is the substring from the last whitespace (or start of line) up to `rl.cursor` that starts with `/`. Example: with buffer `"/speckit-plan arg --help"` and cursor at position 8 (inside `speckit-plan`), the token is `"/speckit"`.
- If no such token exists (buffer doesn't contain `/` at a command position, or the cursor is past the first whitespace after the command when argument-completion is out of scope), `wantsInput` is false and autocomplete is inert (no matches, no rendering, no key handling).

## Matching (FR-002, FR-003)

- **Registry**: `buildCommandRegistry(skills)` as defined in data-model.md. Deterministically sorted by `name`.
- **Filter**: `matches = registry.filter(e => e.name.startsWith(prefix))` where `prefix` is the token with leading `/` stripped, case-sensitive. No fuzzy, substring, or case-insensitive matching.
- **Ordering**: lexicographic by `name` (e.g., `/clear`, `/exit`, `/quit`, `/speckit-analyze`, `/speckit-checklist`, ...). Tab cycles in this order.
- **Real-time update**: on every buffer change (character added/removed, cursor moved), recompute `prefix` and `matches` via a debounced invocation (see Debounce below). New `matches` replace previous ones; `selectedIndex` resets to `-1`.

## Display (FR-002, FR-007, FR-012)

- **When**: render iff `matches.length > 0 && wantsInput(line, cursor) && visible && !disabled`.
- **Where**: a block directly below the prompt line, written through `rl.output` (readline's terminal output, `process.stdout` when `terminal: true`), not through the agent stdout stream (`process.stdout.write` used by `agent.prompt`'s `onText`). This preserves FR-012: prompt and prior model output above it are not overwritten.
- **Content per row**: `qualifiedName` (e.g., `/speckit-specify`) + ` - ` + truncated `description`. Descriptions are truncated to `availableWidth = columns - qualifiedName.length - 3` (for `" - "`), using `process.stdout.columns ?? 80`. Truncation appends `"…"` when clipped; no wrapping.
- **Highlight**: the row at `selectedIndex` is rendered with inverse video (`\x1b[7m` prefix, `\x1b[27m` suffix) plus a leading `› ` marker. All other rows are plain.
- **Clearing**: on `visible` → `false` (Escape, prefix becomes non-`/` input, dismissal, disable), clear the suggestion block by issuing `readline.clearScreenDown` (or equivalent `\x1b[J`) from the prompt line and moving the cursor back to its original position relative to the prompt. No leftover artifacts (SC-005).
- **Empty state**: when `matches.length === 0`, no block is rendered; no "no matches" placeholder (spec Acceptance Scenario 1.2 says "no autocomplete list is shown" — an empty block is a list, so it is not shown).

## Debounce (FR-011)

- A single trailing timer of 25 ms (midpoint of the spec's 20–30 ms window). Each new keystroke cancels the prior timer and schedules a new one. Only the last buffer state within the window triggers `filter` + `render`.
- No leading emission. No intermediate rendering of stale prefixes.
- The debounce wrapper is pure in that it holds no rendering state beyond the pending timer id and last buffer snapshot; a `flush()` on `Enter` bypasses the timer.

## Tab completion (FR-004, FR-006)

- **Single match**: `Tab` replaces the token at cursor with `matches[0].qualifiedName`, places cursor after the completed text plus a trailing space, and hides the suggestion block (completed, no longer needed).
- **Multiple matches**: repeated `Tab` cycles `selectedIndex = (selectedIndex + 1) % matches.length` and completes the token to `matches[selectedIndex].qualifiedName` on each press. The suggestion list stays visible, with the new `selectedIndex` highlighted. This is cycling, not longest-common-prefix completion (per clarification).
- **No matches**: `Tab` is a no-op — buffer unchanged, no highlight, no error.
- **Completion writes**: via readline's buffer mutation (`rl.line` assignment + cursor update + `rl.write` or `rl.prompt(true)` to redraw the line), not by injecting literal keystrokes. This keeps undo/history intact.

## Arrow-key navigation (FR-005)

- `ArrowDown`: `selectedIndex = (selectedIndex + 1) % matches.length`, re-render highlight, do not complete the buffer (buffer stays as typed; completion happens only on `Tab` or `Enter` with a selection).
- `ArrowUp`: `selectedIndex = (selectedIndex - 1 + matches.length) % matches.length`, re-render highlight, do not complete.
- When `selectedIndex === -1` (no selection yet), first `ArrowDown` selects index 0; first `ArrowUp` selects last index.
- Arrow keys are consumed (`handleKey` returns true) only when `visible`; otherwise they fall through to readline's default (cursor movement / history).

## Dismissal (FR-008, FR-009)

- `Escape`: clears block, sets `visible = false`, `selectedIndex = -1`, does not alter the buffer.
- `Backspace` that removes the leading `/` or makes `wantsInput` false: same as `Escape` — dismiss and clear.
- Cursor moved away from the `/` token (e.g., arrow-left past `/`): `wantsInput` becomes false → dismiss.
- Another `UXComponent` activates (`UXManager.activate(other)`): autocomplete's `dismiss()` is called automatically (exclusive focus).
- When the occupying component `deactivate()`s and `wantsInput(line, cursor)` is still true, autocomplete `restore()` is called and may re-render if `matches` is still non-empty (FR-009 "can restore").

## Fallback (FR-013)

- **Pre-flight**: if `!process.stdout.isTTY || !process.stdin.isTTY`, autocomplete is not wired at all — no completer, no keypress listener, no rendering, zero behavior change.
- **Runtime**: any exception thrown inside `render`, `handleKey`, or the debounced `filter` is caught. The handler calls `disable("autocomplete")`, clears any rendered block, emits `console.error("Warning: Autocomplete disabled: " + err.message)` (stderr, per Principle V), and removes its keypress delegation. The REPL remains fully functional; manual typing of full command names still works.
- **Terminal resize**: `process.stdout.on("resize", ...)` re-renders truncation widths if visible; if the width becomes unreadable, the render path's try/catch degrades to the same silent-disable behavior.

## Compatibility with skill dispatch (FR-010, existing repl-command-contract)

- Autocomplete does not change what `resolveCommand` does on `"line"` submit. It only mutates `rl.line` before the `"line"` event fires (via Tab/Enter completion). After submission, the existing resolution order (built-ins → `/skill:` namespaced → bare skill → fallback literal prompt) applies unchanged. A completed `"/speckit-specify"` is dispatched identically to a manually typed `"/speckit-specify"`.

## Observable guarantees this contract must satisfy

- Typing `"/"` shows all slash commands with descriptions; each additional character narrows the list in real time.
- Typing non-`/` text never triggers a suggestion block.
- `Tab` with multiple hits cycles deterministically in sorted order; a second `Tab` does not re-sort or restart.
- `Escape` always dismisses without altering buffer; typing continues without autocomplete until a new `/` token is formed.
- A render failure never crashes the process, never corrupts `Agent` history, and leaves a single stderr warning; no retry loop.
- When stdin/stdout is piped or non-TTY, no completer is registered and `rl.on("line")` dispatch is byte-for-byte identical to the current implementation.
