# Data Model: Command Autocomplete and Tab Completion UX

No persistent storage is introduced by this feature. All shapes below are in-memory, computed at startup or per keystroke, and held for the life of the REPL process (same lifecycle as the discovered-skills map in 001). Where a shape derives from an existing entity, its source is noted.

## CommandEntry

The registry entry for one invocable slash command — the union of built-ins and discovered skills. Backed by the existing `Skill` type (src/skills.ts) + the fixed built-in set, not a new persisted entity.

| Field | Type | Source | Notes |
|---|---|---|---|
| `name` | `string` | Skill directory name or built-in literal (`"clear"` / `"exit"` / `"quit"`) | Canonical lookup key, without leading `/`. For skills this is `Skill.name` (directory name), not `Skill.frontmatterName`. |
| `qualifiedName` | `string` | Derived: `"/" + name` | What the user types and what Tab completes to. Built-ins and skills share this display form. |
| `description` | `string` | Built-ins: fixed short string (e.g. `"Clear conversation history"`). Skills: `Skill.description` (frontmatter) | Shown truncated in the suggestion list (FR-002). |
| `kind` | `"builtin" \| "skill"` | Whether the entry came from the reserved set or the skills map | Built-ins shadow same-named skills on bare lookup (per `resolveCommand`), but both appear in the registry — the matching contract documents which prefix brings which into suggestions (see autocomplete-contract.md). |
| `source` | `Skill["source"] \| "builtin"` | `Skill.source` or `"builtin"` | Diagnostics only; not shown in autocomplete. |

**Validation rules**:
- Every `CommandEntry.name` is non-empty; skill-sourced entries have already passed `parseSkillFile`'s `name` + `description` required check (data-model.md in 001).
- Registry is deduplicated by `name` at construction (built-ins first, then merged skills map which is already deduplicated by `mergeSkillSources`). No two entries share a `name`.

**Lifecycle**: Built once at startup from `skills` + built-ins (after `discoverSkillsFrom` / `mergeSkillSources`). Not mutated for the life of the process — same invariant as the skills map (001 data-model.md Lifecycle).

## AutocompleteState

Ephemeral per-keystroke state owned by the autocomplete component. Not persisted, not shared across turns.

| Field | Type | Notes |
|---|---|---|
| `prefix` | `string` | Current normalized prefix being matched — the `"/"`-stripped token up to the cursor, or `""` when not in a slash-command position. |
| `matches` | `CommandEntry[]` | Entries whose `name` starts with `prefix` (case-sensitive), sorted lexicographically. Empty when `prefix` is not a slash-command prefix or when nothing matches. |
| `selectedIndex` | `number` | Index into `matches` of the currently highlighted item. `-1` when no item is highlighted (initial state before first Tab/Arrow). Clamped to `[-1, matches.length - 1]`. |
| `visible` | `boolean` | Whether the suggestion list is currently rendered below the prompt. `false` when `matches` is empty, when dismissed, or when disabled. |

**State transitions**:
- On buffer change (debounced): recompute `prefix` from `rl.line` + `rl.cursor`; recompute `matches`; reset `selectedIndex` to `-1`; set `visible = matches.length > 0 && wantsInput(line)`.
- On `Tab`: if `matches.length === 0` → no-op; if `matches.length === 1` → complete to `matches[0].qualifiedName`; if `matches.length > 1` → advance `selectedIndex = (selectedIndex + 1) % matches.length`, complete `rl.line` to `matches[selectedIndex].qualifiedName`, keep `visible = true`.
- On `ArrowDown`/`ArrowUp`: move `selectedIndex` cyclically within `matches`; `visible` unchanged.
- On `Escape` / `Backspace` past `/` /blur of `/` prefix / explicit `dismiss()`: `visible = false`, `selectedIndex = -1`, suggestion block cleared.
- On `Enter`: if `selectedIndex >= 0 && visible` → complete to `matches[selectedIndex].qualifiedName` before submitting; else submit as-is (existing `"line"` dispatch, no autocomplete effect).
- On `disable()`: `visible = false`, further keystrokes do not recompute or render; stderr warning emitted once.

## UXComponent

The extensible framework's extension-point contract (FR-009, FR-010). Not persisted; registered in memory within `UXManager`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unique component identity (e.g. `"autocomplete"`). Used for `disable(id)` and logging. |
| `wantsInput(line: string, cursor: number): boolean` | `(string, number) => boolean` | Whether this component wishes to be active for the current buffer. Autocomplete: true iff `line.slice(0, cursor)` contains a `/` token at a command position (start of line or after whitespace, per spec FR-001). Future components (permission prompt, etc.) use their own predicate. |
| `handleKey(key: Key): boolean` | `(Key) => boolean` | Consumes a key event (Tab, arrows, Escape, etc.). Returns true if consumed (prevents default readline handling). |
| `render(state: AutocompleteState): void` | `(AutocompleteState) => void` | Writes the suggestion block below the prompt (ANSI). Only called when `visible`. |
| `dismiss(): void` | `() => void` | Clears rendered block and sets `visible = false`. Called when another component takes exclusive focus or when `Escape` is pressed. |
| `restore?(line: string, cursor: number): void` | optional | Called when the deactivating component releases focus and the line still `wantsInput`. Autocomplete may re-render if prefix still valid (FR-009 "can restore"). |

**Lifecycle & relationships**:

```
UXManager
  ├─ registry: UXComponent[]                (all registered components)
  ├─ active: UXComponent | null             (at most one — exclusive focus, FR-009)
  └─ disabled: Set<string>                  (ids disabled by fallback, never reactivated)

Transitions:
  register(c)      → adds to registry; does not activate
  activate(c)      → if active !== null && active !== c → active.dismiss(); active = c
  deactivate(c)    → if active === c → active.dismiss(); active = null; probe registry for restoration (FR-009)
  disable(id)      → adds to disabled; if active?.id === id → active.dismiss(); active = null; remove keypress delegation
  onKeypress(key)  → if active !== null → active.handleKey(key) else probe wantsInput → activate if found
  onLineChange     → if active !== null && !active.wantsInput(line, cursor) → active.dismiss(); active = null
                     else if active !== null → active.render(state) (debounced)
                     else probe registry for activation
```

## CommandRegistry

Derived, not stored — the flat `CommandEntry[]` array built once from the existing `skills: Map<string, Skill>` plus the three built-in constants. Not an entity with its own file; its construction is a pure function `buildCommandRegistry(skills: Map<string, Skill>): CommandEntry[]` in `src/autocomplete.ts`.

| Derivation | Step |
|---|---|
| 1. Built-ins | For each `name` in `RESERVED_COMMAND_NAMES` (`"clear"`, `"exit"`, `"quit"`), push `{ name, qualifiedName: "/" + name, description: builtinDescriptions[name], kind: "builtin", source: "builtin" }`. |
| 2. Skills | For each `[name, skill]` in the merged skills map, push `{ name, qualifiedName: "/" + name, description: skill.description, kind: "skill", source: skill.source }`. |
| 3. Sort | Results are sorted by `name` lexicographically for deterministic Tab cycling. No deduplication beyond the map's own guarantees. |

## Key (keyboard event abstraction)

A tiny struct carried by `handleKey` so components don't depend directly on Node's `keypress` args shape.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Canonical key name: `"tab"`, `"up"`, `"down"`, `"enter"`, `"escape"`, `"backspace"`, etc. (Node `keypress` key.name). |
| `ctrl` / `shift` | `boolean` | Modifiers, if relevant. |
| `sequence` | `string` | Raw sequence, for diagnostics only. |

## Relationships & resolution order

```
src/skills.ts (existing)
  └─ discoverSkillsFrom + mergeSkillSources → Map<string, Skill>
       └─ buildCommandRegistry(skills) → CommandEntry[]          (autocomplete.ts)
            └─ filterByPrefix(entries, prefix) → CommandEntry[]  (autocomplete.ts, FR-002/FR-003)
                 └─ AutocompleteState { prefix, matches, ... }   (autocomplete.ts)
                      └─ rendered via UXComponent.render()       (ux.ts lifecycle)
                           └─ exclusive-focus managed by UXManager (ux.ts)
                                └─ wired in src/index.ts (readline completer + keypress → UXManager delegation)
```

For a bare `/<prefix>` in the line buffer:
1. `prefix = tokenWithoutSlash` at cursor.
2. `matches = registry.filter(e => e.name.startsWith(prefix))` (case-sensitive).
3. Render or cycle — selection is bounded by `matches.length`; Tab never leaves this set.

For non-`/` input: `wantsInput` is false → `AutocompleteState` is inert (`visible = false`, `matches = []`), behavior is byte-for-byte identical to today's REPL (FR-010 / SC-002).

## Configuration / inputs

No config file (Principle IV). The only inputs are:
- The in-memory `skills` map (already determined by filesystem discovery at startup).
- `process.stdout.columns` for truncation width.
- `process.stdout.isTTY && process.stdin.isTTY` for enablement gating.

All three are read once or per-render and not persisted.
