# Contract: `~/.ii/` Config Files

**Feature**: [spec.md](../spec.md) | Applies to: `src/config.ts`

## Files

| Path | Content | Permissions |
|------|---------|-------------|
| `~/.ii/model.json` | `{ "current": "<registry-id>" }` | Default (`0644` minus umask) |
| `~/.ii/credentials.json` | `{ "anthropic": "<key>", "meta": "<key>" }` (absent keys omitted) | `0600` enforced on write |

`~` resolves via `os.homedir()`; `~/.ii/` created with `mkdir -p` on first write.
Paths are constructed internally — no user input ever reaches these filesystem
calls (Principle II exception is internal-only by construction).

## Load semantics

| Situation | Behavior |
|-----------|----------|
| Either file missing | Defaults (default model; no keys) — NOT an error |
| Corrupt JSON | Readable error naming the file; session continues on defaults; file is NEVER auto-rewritten |
| Unknown `current` id | Readable error naming id + file; session uses default until `/model` repair |
| Key missing/invalid for SELECTED model | Secure re-prompt per model-command contract |
| Key missing for UNSELECTED provider | Ignored entirely |
| Legacy `II_MODEL` / `ANTHROPIC_API_KEY` env set | Ignored (not even read for provider purposes) |

## Write semantics

- Preference writes are atomic-per-write (single `writeFileSync` of the full
  JSON document); credentials writes MUST pass `mode: 0o600`.
- Credential values MUST NOT appear in logs, errors, stdout, or thrown messages;
  errors reference the provider name only (e.g. `Missing Meta API key — run /model`).
