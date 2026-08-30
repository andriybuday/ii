# Contract: UX Component Framework (Extensible Interactive Layer)

This contract defines the extension-point interface that autocomplete is the first consumer of (FR-009, FR-010, US3). It is the "clear extension point for adding new interactive UX components" promised in FR-009 and the lifecycle that makes FR-009's "autocomplete dismisses when another component appears, can restore" testable without reference to a specific future component's internals. It is the sole contract for `src/ux.ts`.

## Interface — UXComponent

```ts
interface UXComponent {
  /** Unique identity — stable across the session. Used for disable() and logging. */
  readonly id: string; // e.g. "autocomplete"

  /** Whether this component wishes to be the active one for the current buffer. */
  wantsInput(line: string, cursor: number): boolean;

  /** Consume a key event. Return true if consumed (caller must not forward to readline's default). */
  handleKey(key: Key): boolean;

  /** Render the component's visual block below the prompt (when it is active + visible). */
  render(state: AutocompleteState): void;

  /** Clear any rendered block and mark the component inactive (no side effect if already inactive). */
  dismiss(): void;

  /** Optional: called when the occupying component releases focus and this component's wantsInput is still true. */
  restore?(line: string, cursor: number): void;
}
```

`Key` is `{ name: string; ctrl?: boolean; shift?: boolean; sequence: string }` (Node `keypress` shape, data-model.md).

No other method or property is required. A component that does not need restoration may omit `restore`; a component that renders nothing (e.g., a headless prompt) may make `render` a no-op — the interface is still satisfied, but the component should still implement `dismiss` to clear whatever it rendered.

## Manager — UXManager

```ts
class UXManager {
  register(component: UXComponent): void;
  /** Make `component` the exclusive active component, dismissing the current active one. */
  activate(component: UXComponent): void;
  /** Release `component` if it is currently active; probe for restoration. */
  deactivate(component: UXComponent): void;
  /** Permanently disable `id` (FR-013 fallback); removes delegation, no reactivation. */
  disable(id: string): void;

  /** Delegates a keypress — forwards to active.handleKey if active, else probes registry. */
  onKeypress(key: Key, line: string, cursor: number): boolean;
  /** Delegates a line-buffer change — debounced render or dismissal. */
  onLineChange(line: string, cursor: number): void;
  /** Re-render truncation after terminal resize, if active + visible. */
  onResize(): void;
}
```

**Invariants**:
- `registry: UXComponent[]` — all components ever `register`'d, in registration order. Autocomplete is registered first; future components register after it. Probe order is registration order.
- `active: UXComponent | null` — at most one. `null` means no component owns the suggestion area / key handling.
- `disabled: Set<string>` — ids that have been `disable()`'d. A disabled component is never probed for `wantsInput`, never `activate()`'d, and its key handler is never called — its rendering is dead for the rest of the process.
- After `activate(c)`: if `active` was non-null and `active !== c`, `active.dismiss()` is called before `active` is reassigned. This is what makes "autocomplete dismisses when a new component appears" structural, not advisory.
- After `deactivate(c)` where `c === active`: `c.dismiss()` is called, `active = null`, then the manager probes the registry in order for a component whose `wantsInput(line, cursor)` is true and that is not disabled — if found, `activate(found)` is called. This is the "can restore" path.
- `onKeypress` when `active !== null` → `active.handleKey(key)` (exclusive; no other component is probed for this key). When `active === null` → probe registry; first `wantsInput` hit is `activate()`'d then `handleKey` is forwarded if applicable.
- `onLineChange` when `active !== null && !active.wantsInput(line, cursor)` → `active.dismiss(); active = null` (buffer no longer belongs to the active component). When `active === null` → probe for a newly eligible component.
- Errors thrown inside any `UXComponent` method are caught by `UXManager`, routed to `disable(component.id)`, and logged once to `console.error` (stderr). The error does not propagate to readline or to the `Agent`.

## Concrete consumer — AutocompleteComponent

The autocomplete implementation's conformance to this contract is summarized; full matching/rendering behavior is in `autocomplete-contract.md`.

| Requirement | Conformance |
|---|---|
| `id` | `"autocomplete"` |
| `wantsInput` | true iff the token at `cursor` starts with `/` (autocomplete-contract.md "Input shape"). |
| `handleKey` consumes `Tab`, `ArrowUp`, `ArrowDown`, `Escape`; other keys return false | Matches FR-004/FR-005/FR-008. Consumed keys do not reach readline's default handler. |
| `render` writes suggestion block via `rl.output` below the prompt; no-op when `matches` is empty | Matches FR-007, FR-012. |
| `dismiss` clears the suggestion block and sets `visible = false` | Matches FR-008. |
| `restore` re-derives `matches` from the current buffer and re-renders if non-empty | Matches FR-009 "can restore". |
| Disable semantics | On any render/key error, `UXManager.disable("autocomplete")` tears down the completer + keypress listener, clears the block, logs to stderr once. No further autocomplete rendering for the session. |

## Extension example — how a future component would use this contract

A hypothetical permission prompt would:

```ts
class PermissionPrompt implements UXComponent {
  readonly id = "permission-prompt";
  wantsInput() { return this.pendingPermission !== null; }
  handleKey(key: Key) {
    if (key.name === "y") { this.resolve(true); return true; }
    if (key.name === "n") { this.resolve(false); return true; }
    return false;
  }
  render() { /* write "Allow? (y/n)" below prompt via rl.output */ }
  dismiss() { /* clear the y/n block */ }
  // no restore — once answered, it does not come back
}

// wiring in src/index.ts (analogue of autocomplete wiring):
const ux = new UXManager();
ux.register(autocompleteComponent);
ux.register(permissionPrompt);
// when a tool asks for permission:
ux.activate(permissionPrompt); // autocomplete auto-dismissed
// on answer:
ux.deactivate(permissionPrompt); // autocomplete probed for restore if buffer still "/..."
```

This keeps `index.ts`'s change surface to "create manager, register components, delegate keypress/line events to manager" — the existing `"line"` → `resolveCommand` → `agent.prompt` dispatch is not modified.

## Observable guarantees this contract must satisfy

- Registering a component has no visible side effect until its `wantsInput` becomes true or it is explicitly `activate()`'d.
- `activate(other)` while autocomplete is active always results in autocomplete's suggestion block being cleared before `other`'s block is rendered — no overlapping blocks.
- `deactivate(other)` when the buffer still contains a `/` prefix always results in autocomplete restoring (if not disabled) without the user having to retype or press a key.
- `disable(id)` after a render failure guarantees no further `render` or `handleKey` calls for that id for the rest of the process, and a single stderr warning; the REPL stays usable.
- A component's `wantsInput(line, cursor)` returning false is sufficient to keep it inactive — no additional `isEnabled` flag is consulted.
- Errors inside any component method never crash the process, never corrupt `Agent.history`, and never prevent other components' methods from being callable (isolation via try/catch per call).
