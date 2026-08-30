# Contract: REPL Command Dispatch

This is the behavioral contract for how a line typed at the `ii` prompt is resolved,
covering the addition this feature makes to the REPL's existing dispatch in
`src/index.ts`. It formalizes data-model.md's "Relationships & resolution order" as an
observable, testable contract.

## Input shape

A line is split into:
- `command` — the leading token, starting with `/`, up to the first whitespace (or the
  whole line if there's no whitespace).
- `args` — everything after the first whitespace, verbatim (may be empty).

Lines that don't start with `/` are entirely out of scope for this contract — they're
handled exactly as they are today (sent through as a literal prompt).

## Resolution order (deterministic, checked in this order)

1. **Exact built-in match.** If `command` is exactly `/clear`, `/exit`, or `/quit`, run
   the existing built-in behavior. This check MUST happen before any skill lookup —
   a skill can never intercept these three names under their bare form (FR-005a).
2. **Namespaced skill match.** If `command` starts with `/skill:`, strip that prefix and
   look the remainder up in the discovered-skills map. Found → run it (substituting
   `args` for `$ARGUMENTS` in its body, per the skill-file-format contract). Not found →
   fall to step 4.
3. **Bare skill match.** Otherwise, strip the leading `/` and look the remainder up in the
   discovered-skills map directly (this only runs if step 1 didn't match, so it can never
   shadow a built-in). Found → run it the same way as step 2.
4. **Fallback.** Nothing matched → today's existing default: send the full original line
   through as a literal prompt (FR-010). No error, no special message.

## Running a matched skill

Running a skill means: substitute `args` for every `$ARGUMENTS` occurrence in the skill's
`body`, then submit the resulting text as the next user turn in the *same* ongoing
conversation history (FR-013) — exactly as if the user had typed that (long) text
themselves. No new tool call, no isolated sub-session.

## Observable guarantees this contract must satisfy

- **No skills present** (`.ii/skills/` and `.claude/skills/` both absent): step 2 and 3
  never find anything for any input; behavior is byte-for-byte identical to `ii` before
  this feature existed (SC-002).
- **Collision across sources**: when building the discovered-skills map, an entry from
  the higher-precedence source (`ii-native`) overwrites one from the lower-precedence
  source (`claude-compatible`) for the same name — so step 2/3 always resolve to the
  `ii-native` version when both exist (FR-005, SC-003).
- **Built-in collision**: a skill directory literally named `clear`, `exit`, or `quit` is
  still added to the discovered-skills map (it's a valid skill) — it's just unreachable
  via step 3, because step 1 always matches first. It remains reachable via step 2
  (`/skill:clear`, etc.).
- **Malformed skill**: a file that fails the skill-file-format contract is simply never
  added to the discovered-skills map — steps 2/3 behave as "not found" for its name, same
  as if the file didn't exist at all. This must not affect resolution for any other name.
