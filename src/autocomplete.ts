/**
 * Autocomplete — registry, filtering, truncation, state, and UXComponent.
 * Spec: data-model.md, contracts/autocomplete-contract.md, research.md Decisions 1-7.
 * No I/O at import time.
 */
import * as readline from "node:readline";
import type { Skill } from "./skills.js";
import { RESERVED_COMMAND_NAMES } from "./skills.js";
import type { UXComponent, Key, UXManager } from "./ux.js";

// ---------------------------------------------------------------------------
// CommandEntry & registry
// ---------------------------------------------------------------------------

export interface CommandEntry {
  name: string;
  qualifiedName: string;
  description: string;
  kind: "builtin" | "skill";
  source: Skill["source"] | "builtin";
}

const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  clear: "Clear conversation history",
  exit: "Exit the agent",
  quit: "Exit the agent",
  model: "List models or switch the active model",
};

export function buildCommandRegistry(skills: Map<string, Skill>): CommandEntry[] {
  const entries: CommandEntry[] = [];

  for (const name of RESERVED_COMMAND_NAMES) {
    entries.push({
      name,
      qualifiedName: `/${name}`,
      description: BUILTIN_DESCRIPTIONS[name] ?? "",
      kind: "builtin",
      source: "builtin",
    });
  }

  for (const [name, skill] of skills) {
    entries.push({
      name,
      qualifiedName: `/${name}`,
      description: skill.description,
      kind: "skill",
      source: skill.source,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

// ---------------------------------------------------------------------------
// Prefix helpers
// ---------------------------------------------------------------------------

/**
 * Extract the "/"-prefixed token prefix at cursor, stripped of leading "/".
 * Returns null when no "/" token exists at cursor (wantsInput === false).
 * Valid token: last whitespace-delimited substring up to cursor that starts with "/".
 * Returns the stripped prefix (e.g. "/speck" at cursor 6 -> "speck", "/" -> "", no token -> null).
 */
export function getSlashPrefix(line: string, cursor: number): string | null {
  const beforeCursor = line.slice(0, cursor);
  // Find last whitespace before cursor
  let tokenStart = 0;
  for (let i = beforeCursor.length - 1; i >= 0; i--) {
    if (beforeCursor[i] === " " || beforeCursor[i] === "\t") {
      tokenStart = i + 1;
      break;
    }
    if (i === 0) tokenStart = 0;
  }
  const token = beforeCursor.slice(tokenStart);
  if (!token.startsWith("/")) return null;
  return token.slice(1);
}

/**
 * Case-sensitive prefix filter; registry is already sorted, so result is sorted.
 */
export function filterByPrefix(entries: CommandEntry[], prefix: string): CommandEntry[] {
  return entries.filter((e) => e.name.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

export function availableColumns(): number {
  const cols = process.stdout.columns;
  // `?? 80` alone would not catch a terminal that legitimately reports 0
  // (seen with some pty setups that never received a window-size ioctl) —
  // guard against any non-positive/NaN value, not just null/undefined.
  return typeof cols === "number" && cols > 0 ? cols : 80;
}

export function truncateDescription(desc: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (desc.length <= maxWidth) return desc;
  if (maxWidth === 1) return "…";
  return desc.slice(0, maxWidth - 1) + "…";
}

// ---------------------------------------------------------------------------
// Rendering — a single suggestion block drawn below the prompt line.
//
// Technique: ANSI save-cursor / restore-cursor (`\x1b[s` / `\x1b[u`) bracket every
// write. This is atomic and needs no bookkeeping of how many rows were previously
// drawn (no drift, no off-by-one accumulation across renders) — the terminal
// cursor always ends up exactly where it started, which is also exactly where
// readline believes it left it, so readline's own redraw stays in sync.
// ---------------------------------------------------------------------------

const MAX_VISIBLE_SUGGESTIONS = 5;

function rlOutput(rl: readline.Interface): NodeJS.WriteStream {
  return (rl as unknown as { output: NodeJS.WriteStream }).output ?? process.stdout;
}

/** Save cursor, drop to the row below the prompt, clear it and everything below, run `write`, restore cursor. */
function withBlockBelowPrompt(rl: readline.Interface, write: () => void): void {
  const out = rlOutput(rl);
  out.write("\x1b[s");
  if (typeof readline.moveCursor === "function") readline.moveCursor(out, 0, 1);
  else out.write("\x1b[1B");
  if (typeof readline.cursorTo === "function") readline.cursorTo(out, 0);
  else out.write("\r");
  if (typeof readline.clearScreenDown === "function") readline.clearScreenDown(out);
  else out.write("\x1b[J");
  write();
  out.write("\x1b[u");
}

function formatRow(entry: CommandEntry, truncatedDesc: string, maxCols: number): string {
  if (truncatedDesc) {
    const row = `${entry.qualifiedName} - ${truncatedDesc}`;
    if (row.length <= maxCols) return row;
    if (entry.qualifiedName.length >= maxCols) return truncateDescription(entry.qualifiedName, maxCols);
    return row.slice(0, maxCols - 1) + "…";
  }
  if (entry.qualifiedName.length <= maxCols) return entry.qualifiedName;
  return truncateDescription(entry.qualifiedName, maxCols);
}

export function clearSuggestions(rl: readline.Interface): void {
  withBlockBelowPrompt(rl, () => {});
}

export function renderSuggestions(
  rl: readline.Interface,
  matches: CommandEntry[],
  selectedIndex: number
): void {
  if (matches.length === 0) {
    clearSuggestions(rl);
    return;
  }
  const cols = availableColumns();
  let visible = matches;
  let start = 0;
  let extra = 0;
  if (matches.length > MAX_VISIBLE_SUGGESTIONS) {
    // Reserve one row for the overflow hint so total rows never exceed
    // MAX_VISIBLE_SUGGESTIONS. Scroll the window so selectedIndex stays visible.
    const capacity = MAX_VISIBLE_SUGGESTIONS - 1;
    extra = matches.length - capacity;
    if (selectedIndex >= capacity) {
      start = Math.min(selectedIndex - capacity + 1, matches.length - capacity);
    }
    visible = matches.slice(start, start + capacity);
  }
  const lines = visible.map((entry, i) => {
    const globalIndex = start + i;
    const avail = Math.max(0, cols - entry.qualifiedName.length - 3);
    const trunc = truncateDescription(entry.description, avail);
    const row = formatRow(entry, trunc, cols);
    return globalIndex === selectedIndex ? `\x1b[7m› ${row}\x1b[27m` : `  ${row}`;
  });
  if (extra > 0) lines.push(`  … and ${extra} more`);

  withBlockBelowPrompt(rl, () => {
    // \r\n (not bare \n) so column resets to 0 on every row even under raw-mode
    // ttys that don't translate LF -> CRLF themselves.
    rlOutput(rl).write(lines.join("\r\n"));
  });
}

// ---------------------------------------------------------------------------
// Line replacement helper
// ---------------------------------------------------------------------------

/**
 * Replace the `/`-token spanning `[before, before + <original token>]` with
 * `newQualifiedName`, keeping the fixed `before`/`after` text untouched.
 *
 * `before`/`after` MUST be captured once when the token was first detected
 * (see `recompute`), not re-derived from the current buffer on every call —
 * after a completion is inserted, the cursor sits right after a trailing
 * space, which no longer looks like part of a "/" token, so re-scanning the
 * already-completed buffer would find nothing to replace and instead append
 * the next cycle's completion after it (e.g. "/foo /bar " instead of "/bar ").
 */
function replaceSlashToken(rl: readline.Interface, newQualifiedName: string, before: string, after: string): void {
  const newLine = before + newQualifiedName + " " + after;
  const newCursor = before.length + newQualifiedName.length + 1;
  (rl as unknown as { line: string }).line = newLine;
  (rl as unknown as { cursor: number }).cursor = newCursor;
  // Force readline to redraw the input row at its new content/cursor. This is the
  // same private hook readline itself relies on internally for insertion; we call
  // it explicitly here because we mutated `line`/`cursor` directly rather than
  // going through readline's own key-handling path.
  try {
    const anyRl = rl as unknown as Record<string, unknown>;
    if (typeof anyRl["_refreshLine"] === "function") {
      (anyRl["_refreshLine"] as () => void).call(rl);
    } else if (typeof anyRl["_updateDisplay"] === "function") {
      (anyRl["_updateDisplay"] as () => void).call(rl);
    }
  } catch {
    // No manual prompt-write fallback — writing prompt+line again here without
    // readline's own cursor accounting would duplicate the prompt on screen.
  }
}

// ---------------------------------------------------------------------------
// AutocompleteState & Component
// ---------------------------------------------------------------------------

export interface AutocompleteState {
  prefix: string;
  matches: CommandEntry[];
  selectedIndex: number;
  visible: boolean;
}

const EMPTY_STATE: AutocompleteState = { prefix: "", matches: [], selectedIndex: -1, visible: false };

export class AutocompleteComponent implements UXComponent {
  readonly id = "autocomplete";
  private state: AutocompleteState = { ...EMPTY_STATE };
  // Fixed text surrounding the token, captured whenever `recompute` finds a
  // live "/" token. Stays constant across a Tab-cycling session (repeated Tab
  // presses do NOT re-trigger `recompute`) so each press replaces exactly the
  // original span instead of wherever the cursor lands after a prior completion.
  private tokenBefore = "";
  private tokenAfter = "";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private disabled = false;

  constructor(
    private registry: CommandEntry[],
    private rl: readline.Interface,
    private manager: UXManager
  ) {}

  wantsInput(line: string, cursor: number): boolean {
    if (this.disabled) return false;
    return getSlashPrefix(line, cursor) !== null;
  }

  private recompute(line: string, cursor: number): void {
    const prefix = getSlashPrefix(line, cursor);
    if (prefix === null) {
      this.state = { ...EMPTY_STATE };
      this.tokenBefore = "";
      this.tokenAfter = "";
      return;
    }
    const matches = filterByPrefix(this.registry, prefix);
    this.state = { prefix, matches, selectedIndex: -1, visible: matches.length > 0 };
    const beforeCursor = line.slice(0, cursor);
    let tokenStart = 0;
    for (let i = beforeCursor.length - 1; i >= 0; i--) {
      if (beforeCursor[i] === " " || beforeCursor[i] === "\t") {
        tokenStart = i + 1;
        break;
      }
      if (i === 0) tokenStart = 0;
    }
    this.tokenBefore = line.slice(0, tokenStart);
    this.tokenAfter = line.slice(cursor);
  }

  /** If a debounced recompute is still pending, run it now (synchronously) so key
   *  handlers act on fresh `matches`. If nothing is pending, `state` is already
   *  current and untouched — this preserves `selectedIndex` across repeated
   *  Tab/Arrow presses instead of resetting it on every keystroke-adjacent key. */
  private flushPending(): void {
    if (!this.debounceTimer) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    const line = (this.rl as unknown as { line: string }).line ?? "";
    const cursor = (this.rl as unknown as { cursor: number }).cursor ?? line.length;
    this.recompute(line, cursor);
  }

  private safeRender(): void {
    try {
      if (this.state.visible && this.state.matches.length > 0) {
        renderSuggestions(this.rl, this.state.matches, this.state.selectedIndex);
      } else {
        clearSuggestions(this.rl);
      }
    } catch (e) {
      console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
      this.disable();
    }
  }

  private disable(): void {
    if (this.disabled) return;
    this.disabled = true;
    this.state = { ...EMPTY_STATE };
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    try {
      clearSuggestions(this.rl);
    } catch {
      // already degrading — nothing more we can do
    }
    this.manager.disable(this.id);
  }

  /** Called by the wiring layer whenever the line buffer may have changed
   *  (after a keystroke has been applied). Debounced per FR-011: no
   *  intermediate renders, only the final state after 25ms of quiet. */
  onLineChange(line: string, cursor: number): void {
    if (this.disabled) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (!this.wantsInput(line, cursor)) {
      const wasVisible = this.state.visible;
      this.state = { ...EMPTY_STATE };
      if (wasVisible) this.safeRender(); // clears the block
      return;
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const curLine = (this.rl as unknown as { line: string }).line ?? "";
      const curCursor = (this.rl as unknown as { cursor: number }).cursor ?? curLine.length;
      try {
        this.recompute(curLine, curCursor);
      } catch (e) {
        console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
        this.disable();
        return;
      }
      this.safeRender();
    }, 25);
  }

  handleKey(key: Key): boolean {
    if (this.disabled) return false;
    try {
      const name = key.name;

      if (name === "tab") {
        this.flushPending();
        if (this.state.matches.length === 0) return false;
        if (this.state.matches.length === 1) {
          replaceSlashToken(this.rl, this.state.matches[0].qualifiedName, this.tokenBefore, this.tokenAfter);
          this.state = { ...EMPTY_STATE };
          clearSuggestions(this.rl);
          return true;
        }
        this.state.selectedIndex = (this.state.selectedIndex + 1) % this.state.matches.length;
        this.state.visible = true;
        replaceSlashToken(this.rl, this.state.matches[this.state.selectedIndex].qualifiedName, this.tokenBefore, this.tokenAfter);
        renderSuggestions(this.rl, this.state.matches, this.state.selectedIndex);
        return true;
      }

      if (name === "up" || name === "down") {
        this.flushPending();
        if (!this.state.visible || this.state.matches.length === 0) return false;
        if (name === "down") {
          this.state.selectedIndex =
            this.state.selectedIndex === -1 ? 0 : (this.state.selectedIndex + 1) % this.state.matches.length;
        } else {
          this.state.selectedIndex =
            this.state.selectedIndex === -1
              ? this.state.matches.length - 1
              : (this.state.selectedIndex - 1 + this.state.matches.length) % this.state.matches.length;
        }
        renderSuggestions(this.rl, this.state.matches, this.state.selectedIndex);
        return true;
      }

      if (name === "escape") {
        if (!this.state.visible) return false;
        this.state.visible = false;
        this.state.selectedIndex = -1;
        clearSuggestions(this.rl);
        return true;
      }

      if (name === "return" || name === "enter") {
        this.flushPending();
        if (this.state.visible && this.state.selectedIndex >= 0) {
          // Mutate the buffer to the selected completion now, before returning
          // false — the caller forwards unconsumed keys to readline's own Enter
          // handling next, which will submit whatever `rl.line` holds at that point.
          replaceSlashToken(this.rl, this.state.matches[this.state.selectedIndex].qualifiedName, this.tokenBefore, this.tokenAfter);
        }
        this.state = { ...EMPTY_STATE };
        clearSuggestions(this.rl);
        // Never consumed: readline's own Enter handling must still run to submit.
        return false;
      }

      return false;
    } catch (e) {
      console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
      this.disable();
      return false;
    }
  }

  render(_state: unknown): void {
    this.safeRender();
  }

  dismiss(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.state.visible = false;
    this.state.selectedIndex = -1;
    this.safeRender();
  }

  restore(line: string, cursor: number): void {
    if (this.disabled) return;
    try {
      this.recompute(line, cursor);
    } catch (e) {
      console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
      this.disable();
      return;
    }
    if (this.state.visible) this.safeRender();
  }

  // For polish verification / tests
  getState(): AutocompleteState {
    return { ...this.state };
  }
}
