# Data Model: Muse Spark 1.3 Model Support

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Derived from spec Key Entities + Session 2026-09-05 clarifications. All persisted
state is plain JSON under `~/.ii/`; all wire state is translated at client
boundaries. No database; no migrations (missing file = default).

## Entities

### 1. ModelPreference (`~/.ii/model.json`)

The persisted record of the user's chosen model (spec entity: Model Preference).

| Field | Type | Rules |
|-------|------|-------|
| `current` | string (model id) | REQUIRED; MUST be an id present in the registry; unknown id → readable error naming the file, fall back to default for the session (never crash, never silently rewrite the file) |

- Lifecycle: read at startup → updated by `/model` (both forms) → re-read never
  needed (in-memory copy is source of truth after load).
- Missing file or `{}` → default model. Corrupt JSON → readable error, default.

### 2. CredentialsStore (`~/.ii/credentials.json`, mode `0600`)

Holds provider keys (spec entity: Credentials Store).

| Field | Type | Rules |
|-------|------|-------|
| `anthropic` | string (Bearer key) | OPTIONAL; required only when an Anthropic model is selected |
| `meta` | string (Bearer key) | OPTIONAL; required only when a Meta model is selected |

- Validation: file MUST be created with `0o600`; on load, keys are non-empty
  strings. Missing/invalid key for the *selected* model → secure re-prompt
  (FR-004); keys for unselected providers are never required, read, or logged.
- Keys MUST NOT originate from environment variables or shell history.
- Relationships: keyed by provider name referenced from `ModelRegistryEntry`.

### 3. ModelRegistryEntry (in-code registry, `src/models.ts`)

One entry per available model; the registry ships with exactly two entries.

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | REQUIRED, unique (`claude-sonnet-4-5`, `muse-spark-1.3`); this is what `/model <name>` accepts and `model.json` stores |
| `label` | string | REQUIRED, human-readable (`Anthropic Claude Sonnet (default)`, `Meta Muse Spark 1.3`) |
| `provider` | `"anthropic" \| "meta"` | REQUIRED; selects the client + which credential key is needed |
| `default` | boolean | Exactly one entry is the default (Anthropic) |

- Extensibility: adding a model = one registry row (+ client if the provider is
  new). No loop or REPL control-flow changes.

### 4. NeutralMessage (in-memory conversation history)

Provider-neutral history unit replacing Anthropic-shaped history in `agent.ts`.

| Variant | Fields |
|---------|--------|
| text | `{ role: "user" \| "assistant", text: string }` |
| tool-use | `{ role: "assistant", toolUses: [{ id, name, input }] }` |
| tool-result | `{ role: "user", toolResults: [{ tool_use_id, content, is_error? }] }` |

- State transitions: user text → assistant text/tool-use → tool-result → …;
  `MAX_ITERATIONS` = 50 unchanged. Translation failures become `is_error: true`
  results (Principle III), never history mutation or throws.

### 5. ClientResponse (per-turn normalized provider output)

| Field | Type | Rules |
|-------|------|-------|
| `text` | string | Concatenated text parts (may be empty) |
| `toolUses` | `[{ id, name, input }]` | Empty when the turn is final |
| `stop` | `"end_turn" \| "tool_use"` | Drives the existing loop branches unchanged |
| `usage` | `{ input, output }` | REQUIRED; logged to stderr in today's format |

## Relationships

```text
ModelPreference.current ──references──▶ ModelRegistryEntry.id
ModelRegistryEntry.provider ──selects──▶ ModelClient (AnthropicClient | MetaClient)
ModelRegistryEntry.provider ──names──▶ CredentialsStore key ("anthropic" | "meta")
Agent ──holds──▶ NeutralMessage[] + current ModelClient
```

## Open design detail (for implementation, not spec)

Exact filenames `model.json` / `credentials.json` are the planner's choice within
the spec's "preference file + credentials file" constraint; changing them later
does not alter any acceptance scenario as long as both live directly under `~/.ii/`.
