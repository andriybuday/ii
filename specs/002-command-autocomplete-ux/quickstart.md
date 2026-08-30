# Quickstart: Validating Command Autocomplete and Tab Completion UX

These are runnable, manual validation steps proving the feature works end-to-end, mapped to the spec's acceptance scenarios, FRs, and success criteria. This project has no automated test runner (research.md Decision 8, same precedent as 001 Decision 6), so this is the verification path — treat it as an extension of AGENTS.md's manual testing checklist.

## Prerequisites

```bash
npm install
npm run build    # must succeed with no TypeScript errors (constitution gate)
```

Run all scenarios from the repository root with:

```bash
npm run dev      # or: npm start  (after build)
```

The repo already ships ten `speckit-*` skills under `.claude/skills/` plus built-ins `/clear`, `/exit`, `/quit`. No extra skill setup is needed for the default cases; creation of temporary skills is called out where needed.

## Scenario A — Prefix shows suggestions with descriptions (US1 AC1, FR-001/FR-002, SC-001)

1. Start `ii` in this repo (which already has `.claude/skills/`).
2. Type `/speck` and pause — do not press Enter yet.

**Expected**: a suggestion list appears directly below the prompt (not overwriting the prompt or prior model output), listing every command whose name starts with `speck` — e.g. `/speckit-specify - Create feature specification`, `/speckit-plan - Generate implementation plan`, … — with descriptions truncated to fit the current terminal width. Residual keystrokes after the 25 ms debounce should not produce flicker or stale lists.

## Scenario B — No matches → no list (US1 AC2)

```
ii> /zzz
```

**Expected**: no suggestion block is rendered at all. No "no matches" placeholder, no empty box — the prompt line stays alone, indistinguishable from typing a non-`/` token.

## Scenario C — Real-time narrowing as you type (US1 AC3, FR-003)

1. Type `/spec` → confirm a list is shown.
2. Continue typing to make it `/speckit-p` (i.e., keep the `/` prefix but extend it).

**Expected**: the list narrows on each keystroke (after the ~25 ms debounce), now showing only commands still matching the longer prefix (e.g., only `speckit-plan`). Deleting characters with Backspace must widen it again.

## Scenario D — Non-slash input never triggers autocomplete (US1 AC4, FR-001)

Type ordinary text: `hello world` or `explain list_dir`.

**Expected**: no suggestion block ever appears, no Tab special-casing, no extra stderr output.

## Scenario E — Single-match Tab completion (US2 AC1, FR-004)

1. Type `/speckit-clarify` and — if autocomplete is showing a single match — press `Tab`.

**Expected**: the buffer completes to the full command (with a trailing space after the name so arguments can follow). If only one command matches the typed prefix, `Tab` completes to it in one press. If the typed prefix is already the full name of a known command, `Tab` is a no-op on content (the buffer stays as-is) and does not add duplicate text.

## Scenario F — Multiple matches → Tab cycles (US2 AC2, FR-006, core of FR-004)

1. Type `/speck` (multiple speckit-* matches) so the suggestion list is visible with several rows.
2. Press `Tab` repeatedly, watching the input buffer and the highlight.

**Expected**: first `Tab` completes the buffer to the first lexicographically sorted match and highlights that row; second `Tab` cycles to the second match (buffer updates to that name), third to the third, wrapping around after the last. The highlight tracks the completed name. This is cycling, not "longest common prefix then number list."

## Scenario G — Arrow-key navigation (FR-005, FR-007)

1. With `/speck` showing multiple suggestions, press `ArrowDown` and `ArrowUp` (without pressing `Tab`).

**Expected**: the highlight moves down/up cyclically without completing the buffer — the typed prefix stays `"/speck"` in the input line until the user presses `Tab` or `Enter` with a selection. The highlighted row is rendered with inverse video (`\x1b[7m`) plus a `› ` marker.

## Scenario H — Enter with a selection completes, Enter without selection submits (US2 AC3)

1. With multiple suggestions, `ArrowDown` to highlight an item, then press `Enter`.

**Expected**: the highlighted command is inserted into the buffer and dispatched as the submitted line (the skill or built-in runs, or the fallback path for non-commands, per the existing `resolveCommand` contract).

2. With suggestions visible but no item highlighted (`selectedIndex === -1`), press `Enter`.

**Expected**: the buffer is submitted as typed, without autocomplete inserting a completion.

## Scenario I — Escape and prefix-leave dismiss (FR-008)

- With suggestions visible, press `Escape`.

  **Expected**: the suggestion block clears entirely, `visible` becomes false, the buffer is unchanged, and no highlight remains. Further typing that does not form a new `/` token does not bring the list back.

- Type `/speck`, then `Backspace` to delete the leading `/` (buffer becomes `speck`).

  **Expected**: the block clears as above — `wantsInput` is now false.

## Scenario J — Debounce on rapid typing (Edge Case, FR-011, SC-002)

1. Type a prefix as fast as you can (hold or burst-type, e.g., slam `"/speckit-p"`).

**Expected**: no intermediate stale lists flash on screen. Only the final prefix's suggestions are rendered, appearing within ~50 ms of the last keystroke. The behavior should not show a "loading" indicator.

## Scenario K — Extensibility lifecycle — autocomplete dismisses when another component takes focus, can restore (US3, FR-009)

This scenario validates the `UXComponent` framework structurally; a dedicated second component is not shipped, so exercise it by confirming the lifecycle hooks exist in code review, and by running a small programmatic probe:

1. Code-review `src/ux.ts`: confirm `UXManager.activate(other)` calls `active.dismiss()` for the prior component and that `deactivate(other)` probes `wantsInput` for restoration.
2. If a temporary second component is available (e.g., a fixture in `specs/002-command-autocomplete-ux/`), register it, `activate` it while `/speck` suggestions are visible, and confirm the suggestion block disappears; `deactivate` it while the buffer still contains `/speck` and confirm suggestions reappear without retyping.

**Expected**: adding a new component does not require editing `readline` setup or the `"line"` dispatch beyond registering it with `UXManager`. When it takes focus, autocomplete dismisses automatically and may restore when the buffer still warrants it.

## Scenario L — Silent disable on unsupported terminal (FR-013, US3 AC3 analogue)

```bash
# Non-TTY pipe: autocomplete must not wire itself at all
echo "/speck" | npm run dev 2> /tmp/ii-stderr.txt
cat /tmp/ii-stderr.txt   # should contain no "Autocomplete disabled" warning; no crash
```

And, from an interactive terminal that claims no ANSI (if available):

```bash
NO_COLOR=1 npm run dev 2> /tmp/ii-stderr2.txt
# type /speck — behavior: either suggestions render (if ANSI actually works) or one
# "Warning: Autocomplete disabled: ..." line appears in /tmp/ii-stderr2.txt and no block is ever rendered thereafter.
# In either case, manually typing the full command (e.g. /speckit-specify) still works normally.
```

**Expected**: no crash, no history corruption, no stack trace to stdout. Full commands can still be typed and dispatched manually. Exactly one warning goes to stderr if disabled; nothing goes to stdout.

## Scenario M — No visual artifacts on update, truncation, and resize (SC-005, Edge Cases)

1. With suggestions visible, resize the terminal window narrower and wider.

**Expected**: descriptions re-truncate to the new width (or, if the render path cannot determine the new width, the single silent-disable path of Scenario L takes over). No prompt line is overwritten, no prior model output above the prompt is erased, no flicker or misaligned rows remain.

2. With a temporary long-named skill (e.g., a 60-character name — create a fixture under `.ii/skills/` if needed), type its prefix.

**Expected**: the qualified name plus description fit within the terminal width; the description is truncated with `"…"` rather than wrapping onto the next line.

## Scenario N — Zero behavior change when no skills exist or stdin is piped (SC-002 analogue for 002, FR-010/FR-011 boundary)

```bash
mkdir -p /tmp/ii-empty-autocomplete && cd /tmp/ii-empty-autocomplete
# no .ii/skills, no .claude/skills
npm --prefix /Users/abuday/Projects/ii run dev
# type /clear, / — confirm / still shows built-ins only (/clear /exit /quit) and non-/ input shows nothing.
```

And piped:

```bash
printf "/clear\n/exit\n" | npm run dev
```

**Expected**: startup and runtime output are byte-for-byte identical to today's `ii` for non-`/` input; typing `/` still offers built-ins (the only commands known). Piped input dispatches correctly with no completer registration and no stderr warnings beyond the normal startup messages.

## Checklist tie-back

| Scenario | FRs / SCs |
|---|---|
| A | FR-001, FR-002, SC-001 |
| B | US1 AC2 |
| C | FR-003 |
| D | FR-001 |
| E | FR-004 |
| F | FR-004, FR-006, US2 AC2 |
| G | FR-005, FR-007 |
| H | US2 AC3 |
| I | FR-008 |
| J | FR-011, SC-002 |
| K | FR-009, FR-010, US3 |
| L | FR-013 |
| M | SC-005, FR-012, Edge Cases |
| N | SC-002 analogue, FR-010 |
