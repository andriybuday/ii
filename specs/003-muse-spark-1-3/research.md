# Research: Muse Spark 1.3 Model Support

**Feature**: [spec.md](./spec.md) | **Date**: 2026-09-05

All Technical Context unknowns are resolved below; no `NEEDS CLARIFICATION` remains.

## R1: Meta Model API surface (endpoint, protocol, auth, model id)

- **Decision**: Treat Meta as an OpenAI-compatible Chat Completions provider at base
  URL `https://api.meta.ai/v1`, Bearer-token auth, model id `muse-spark-1.3`.
- **Rationale**: Convergent independent evidence — OpenAI-SDK-based integrations
  against `https://api.meta.ai/v1` for the Muse Spark family (Puter MetaProvider PR,
  yoagent model presets, clawcodex Meta provider, GoModel Meta provider, bitrouter
  registry entry); key convention `META_API_KEY`; function-calling supported via the
  OpenAI tools dialect, which is what the agentic loop needs for FR-002.
- **Alternatives considered**: Anthropic-shaped surface on the bare host (reported
  reachable in one source but not uniformly); Meta Responses-only protocol
  (supported per some sources, but Chat Completions is the widely-attested,
  tool-capable dialect). Rejected: staying Anthropic-SDK-only cannot serve a Meta
  model at all.
- **Risk**: One integration report notes Muse Spark's extended thinking can conflict
  with forced tool choice. Mitigation: never send forced `tool_choice`; use
  `tool_choice: "auto"` only, and verify real tool-call round-trips in the
  implementation smoke test (quickstart scenario 2). If the dialect differs live,
  the failure surfaces gracefully per FR-005 and the client mapping is adjusted —
  no loop changes needed.

## R2: No new SDK — plain `fetch` for the Meta path

- **Decision**: Implement `MetaClient` on Node 20 global `fetch` with hand-rolled
  Chat Completions request/response mapping; add zero dependencies.
- **Rationale**: The Chat Completions JSON surface needed (messages, tools,
  tool_calls, usage) is small and stable; an `openai`-SDK dependency would require
  explicit justification under Principle I / Tech Constraints, while `fetch`
  requires none and keeps the runtime footprint unchanged.
- **Alternatives considered**: `openai` SDK package (heavier, needs justification);
  spawning Muse CLI (out of scope, non-programmatic). Rejected both.

## R3: Provider-neutral history + per-client translation

- **Decision**: `agent.ts` keeps history in a neutral internal shape
  (text / tool-use / tool-result entries); each client translates neutral ↔ wire
  format at the boundary. Switching models swaps the client; history is untouched.
- **Rationale**: Satisfies spec Q3/A (immediate switch, history kept) with no
  per-provider branching in the loop — exactly what Principle I's extensibility
  clause prescribes. Translation bugs degrade to `is_error: true` tool results
  (Principle III), never history corruption.
- **Alternatives considered**: Keep Anthropic-shaped history and translate only in
  `MetaClient` (asymmetric, breaks the day a third provider arrives); per-provider
  histories (switching would wipe context, contradicting Q3/A). Rejected both.

## R4: Secure key prompting in the Node REPL

- **Decision**: Prompt via stdin raw-mode capture (or a muted readline writer) so
  typed characters are never echoed; on submit, write straight to the credentials
  file (0600) and zero the in-memory reference after client construction.
- **Rationale**: Standard CLI practice for secrets; keeps the key out of shell
  history, `ps` args, and stdout logs. No new dependency (readline + stdin raw
  mode are stdlib).
- **Alternatives considered**: OS keychain (rejected by user, Q2/B); visible
  `readline.question` (echoes the secret — unacceptable); env-var import (banned
  by FR-004). Rejected all.

## R5: Config file layout (`~/.ii/` two JSON files)

- **Decision**: `~/.ii/model.json` (`{ "current": "<model-id>" }`) and
  `~/.ii/credentials.json` (`{ "anthropic": "<key>", "meta": "<key>" }`, written
  with mode `0o600`, `mkdir -p` on first use). Missing files = defaults; corrupt
  JSON = readable error naming the file (never a crash, never a silent reset).
- **Rationale**: Matches spec Q5/A (two files) and R4; JSON parses with stdlib;
  0600 mirrors `~/.aws/credentials`-style practice. `HOME` resolution via
  `os.homedir()` (respects platform conventions, no shell interpolation).
- **Alternatives considered**: Single combined file (rejected Q5/A — secrets would
  share permissions with non-secrets); YAML/TOML (needs a parser dep). Rejected.

## R6: Legacy env removal (`II_MODEL`, `ANTHROPIC_API_KEY`-via-env ignored)

- **Decision**: Delete the `II_MODEL` read; read no provider keys from the
  environment. Stale values are ignored (spec edge cases + FR-003) and the removal
  is documented (FR-008). `II_TOOLS_DIR` and `ANTHROPIC_WORKSPACE_ID` are untouched.
- **Rationale**: Direct implementation of spec Q5/A + Q3/B answers; ignoring (not
  erroring) keeps old shells bootable and migratable.
- **Alternatives considered**: Deprecation warning period (rejected by user, Q5/A —
  clean removal).

## R7: Validation without a test runner

- **Decision**: Manual validation per AGENTS.md checklist + [quickstart.md](./quickstart.md)
  scenarios; `npm run build` must stay clean.
- **Rationale**: The repo has no test runner and adding one is out of scope
  (Principle IV creep). Behavioral contracts in `contracts/` make the manual
  drills deterministic and reviewable.
