# Implementation Plan: Muse Spark 1.3 Model Support

**Branch**: `003-muse-spark-1-3` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-muse-spark-1-3/spec.md`

## Summary

Add Meta `muse-spark-1.3` as a selectable model behind a new `/model` REPL command
(bare lists interactively, `/model <name>` switches directly), backed by an extensible
model registry. Provider differences hide behind a generic client abstraction so the
agent loop keeps its shape; the Meta provider speaks the OpenAI-compatible Chat
Completions dialect at `https://api.meta.ai/v1` via plain `fetch` (no new SDK).
Model choice and both provider keys persist in two files under `~/.ii/`; legacy
`II_MODEL` / `ANTHROPIC_API_KEY`-via-env are removed. This file-based config required
a Principle IV constitution amendment — APPROVED and applied 2026-09-05
(constitution 2.0.0); the implementation gate is lifted.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js >= 20

**Primary Dependencies**: `@anthropic-ai/sdk` (existing, Anthropic path); global
`fetch` for the Meta path (zero new dependencies — no dep justification required)

**Storage**: Two JSON files under `~/.ii/` — model preference file + separate
credentials file (0600). See [data-model.md](./data-model.md).

**Testing**: No test runner in repo (manual checklist per AGENTS.md): `npm run build`
clean, `npm run dev` starts, path-traversal/output-truncation/iterations/token-log
drills, plus [quickstart.md](./quickstart.md) end-to-end scenarios.

**Target Platform**: macOS/Linux terminal, Node >= 20

**Project Type**: CLI (REPL) + programmatic library (`Agent`, `Tool` exports)

**Performance Goals**: No new latency targets; model switch applies to the next prompt
with no restart; secure key prompt must not echo input.

**Constraints**: `src/agent.ts` MUST stay ~≤100 lines (Principle I); no I/O at module
import time; diagnostics to stderr / user text to stdout; tool outputs truncated at
10k chars; bash timeout 30s; `MAX_ITERATIONS` = 50.

**Scale/Scope**: Registry ships 2 models (default Anthropic + `muse-spark-1.3`);
extensible for future models without loop changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Radical Minimalism** — PASS (by design): provider logic lives in new modules
  behind one generic client interface the loop calls uniformly; `fetch` adds no
  dependency; registry addition costs no loop branches.
- **II. Safety by Default** — PASS (by design): `~/.ii/` paths are constructed
  internally (no user input reaches the filesystem); credentials file written 0600;
  key prompt never echoes; keys never logged; existing truncation/timeout/iteration
  guarantees untouched.
- **III. Fail Gracefully** — PASS (by design): client/network/auth failures surface
  as error text (never throw into history); malformed tool calls become
  `is_error: true` results; history stays provider-neutral so retries survive.
- **IV. No Feature Creep / env-only config** — PASS (amended): file-based `~/.ii/`
  config is now the sanctioned exception under Principle IV (constitution 2.0.0,
  approved 2026-09-05). Record retained in Complexity Tracking below.
- **V. Transparent Text Interface** — PASS (by design): `/model` works over the
  text protocol and is added to the autocomplete registry + reserved-name set;
  model switching also exposed programmatically (`agent.setModel`); token/startup
  diagnostics stay on stderr.
- **Tech constraints** — PASS: Node >= 20, `tsc` clean, symlink-safe paths
  (no new entry-point detection), new LLM access via generic abstraction only.

## Project Structure

### Documentation (this feature)

```text
specs/003-muse-spark-1-3/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── agent.ts      # Loop unchanged in shape; takes a ModelClient, keeps neutral history
├── clients.ts    # NEW: ModelClient interface + AnthropicClient + MetaClient (fetch)
├── config.ts     # NEW: ~/.ii/ preference + credentials load/save (0600), env legacy ignored
├── models.ts     # NEW: extensible registry (default + muse-spark-1.3)
├── index.ts      # REPL: /model builtin (list/switch/secure prompt), wiring
├── skills.ts     # Add "model" to builtin + reserved names
├── autocomplete.ts # Register /model entry
├── tools.ts      # Untouched
└── types.ts      # Untouched
```

**Structure Decision**: Single-project CLI layout (existing `src/`); three small new
modules (`clients.ts`, `config.ts`, `models.ts`) keep provider, persistence, and
registry concerns out of the loop and the REPL, per Principles I and IV-amendment
scope. No test-dir changes (repo has no runner; validation is manual per AGENTS.md).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle IV: user-scoped config files under `~/.ii/` (preference + credentials) instead of env-only; removal of `II_MODEL` | Interactive credential provisioning cannot live in env per explicit user requirement (3 clarify rounds); secrets must not pass through shell history/environment, which env-vars cannot guarantee | Staying env-only directly contradicts the user's settled requirement; XDG/`~/.config` split was rejected by the user in favor of a single `~/.ii/` home |
| `src/agent.ts` history becomes provider-neutral (translation moves into clients) | Keeping history across an immediate mid-conversation model switch (spec Q3/A) is impossible with Anthropic-shaped history without per-provider branches in the loop | Per-provider history branches in `agent.ts` would violate Principle I's "no bespoke per-provider branching" rule and grow the loop past budget |

### Principle IV amendment (APPROVED and applied 2026-09-05 — constitution 2.0.0)

> Configuration for non-interactive/project behavior stays environment-based.
> User-scoped interactive state — model preference and credentials that must not
> traverse shell history or the environment — MAY persist in files under `~/.ii/`
> (preference readable; credentials 0600, never logged). This is the sole
> sanctioned exception to env-only config.
>
> Per the constitution versioning policy this redefines a principle → MAJOR bump
> (1.2.0 → 2.0.0) with the Sync Impact Report refreshed in the same change.
> AGENTS.md's "Do NOT add config file parsing" must be narrowed to match.
