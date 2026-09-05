# Quickstart: Muse Spark 1.3 Model Support

**Feature**: [spec.md](./spec.md) | **Contracts**: [model command](./contracts/model-command-contract.md), [config files](./contracts/config-file-contract.md)

Runnable validation that the feature works end-to-end. No implementation code here —
scenarios reference contracts and the data model; bodies belong in `tasks.md` /
implementation. Assumes a valid Meta key is available for scenarios 2–4.

## Prerequisites

```bash
npm run build        # must compile clean (tsc, no errors)
npm run dev          # agent starts without errors
```

## Scenarios

### 1. Default unchanged (P2, SC-002)

```bash
rm -rf ~/.ii && unset II_MODEL
npm run dev
ii> list the files in src/
```

- Expect: tool-backed answer from the default model; `~/.ii/` untouched by reads;
  stale `II_MODEL=anything` (separate shell) changes nothing.

### 2. Switch + tool round-trip on Meta (P1, SC-001)

```bash
npm run dev
ii> /model
ii> /model muse-spark-1.3
ii> list the files in src/ and summarize agent.ts
```

- Expect: model list marks current; switch confirms; next prompt answers from
  tool results (proves function-calling path, R1 risk retired); token line on stderr.

### 3. Persistence + immediate switch (FR-001/FR-003)

```bash
ii> /model muse-spark-1.3     # mid-conversation, history kept
# restart ii
ii> /model                    # still current: muse-spark-1.3
```

- Expect: switch applied to the very next prompt; after restart the choice holds
  with no re-selection; `~/.ii/model.json` contains the id.

### 4. Missing/invalid key flow (P3, SC-003)

```bash
rm -f ~/.ii/credentials.json
npm run dev
ii> /model muse-spark-1.3     # secure prompt, no echo
ii> hello                     # with wrong key: readable error + re-prompt, alive
```

- Expect: no crash, history intact, retry after fix succeeds; `ls -l` shows
  credentials file at `0600`; key appears nowhere in logs or shell history.

### 5. Unknown model + legacy env (edge cases)

```bash
ii> /model nope               # Unknown model "nope". Available: …
II_MODEL=claude-sonnet-4-5 npm run dev   # ignored, default governs
```

- Expect: process alive in both cases; docs describe the migration.

### 6. Full drill (SC-004)

A new user following only the docs reaches a first `muse-spark-1.3` tool-backed
response in under 10 minutes with a valid key in hand.

## Safety re-check (AGENTS.md, any loop/tool touch)

Path traversal blocked (`read_file ../../../etc/passwd` refused), large-file
output truncated, 50-iteration cap holds, token usage on stderr.
