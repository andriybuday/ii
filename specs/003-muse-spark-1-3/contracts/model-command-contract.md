# Contract: `/model` REPL Command

**Feature**: [spec.md](../spec.md) | Applies to: `src/index.ts`, `src/skills.ts`,
`src/autocomplete.ts`

`model` becomes a reserved builtin alongside `clear`/`exit`/`quit` (never
overridable by a skill; reachable as `/skill:model` only if a skill collides —
per AGENTS.md precedence, bare `/model` MUST win).

## Forms

```text
/model            List registry models interactively, marking the current one
/model <name>     Switch directly to registry id <name>
```

## Behaviors

| Input | Output (stdout) | Side effects |
|-------|-----------------|--------------|
| `/model` | Numbered list `id — label`, current marked, e.g. `* claude-sonnet-4-5 — … (current)` | None |
| `/model muse-spark-1.3` (known id) | `Switched to muse-spark-1.3 (Meta Muse Spark 1.3).` | Preference file updated; client swapped; history KEPT; applies to next prompt |
| `/model <unknown>` | `Unknown model "<unknown>". Available: <id>, <id>.` (stderr or stdout as error text; process alive) | None |
| Selecting a model whose key is missing/invalid | Secure non-echoing prompt `Enter <provider> API key: ` → `Saved.` | Key stored to credentials file (0600); never echoed, logged, or exported |

## Invariants

- Switch takes effect on the NEXT prompt; history is never cleared by a switch.
- Restart restores `model.json` choice without prompting.
- Legacy `II_MODEL` / env-provided keys are ignored (no warning required;
  migration is documented, FR-008).
- All diagnostics (token usage, warnings) stay on stderr; command results on stdout.
- `/model` MUST appear in the autocomplete registry as a builtin entry.
