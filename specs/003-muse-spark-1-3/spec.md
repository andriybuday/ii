# Feature Specification: Muse Spark 1.3 Model Support

**Feature Branch**: `003-muse-spark-1-3`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "add support for muse-spark-1.3 model from Meta"

## Clarifications

### Session 2026-09-04

- Q: How should a user select `muse-spark-1.3` as the active model? → A: New `/model` command for selecting models, with the choice persisted in the `~/.ii/` folder (custom answer building on Option A reuse of `II_MODEL` semantics; credential storage to be clarified separately in Q2).
- Q: Where should the Meta API key be stored instead of an environment variable? → A: Credentials file under `~/.ii/` with restricted (0600) permissions (Option B).
- Q: When the user picks a different model with `/model`, when does the switch take effect? → A: Takes effect immediately for the next prompt, keeping existing conversation history (Option A).
- Q: When both the old `II_MODEL` variable and the new `/model` persisted choice are set, which one wins? → A: Persisted `/model` choice takes precedence over `II_MODEL` (Option A; whether `II_MODEL` should remain at all is resolved in Q5).
- Q: Should the old `II_MODEL` variable be removed now that `/model` persists the choice? → A: Remove `II_MODEL` entirely; `/model` persisted choice is the only mechanism (Option A).

### Session 2026-09-05

- Q: How does the Meta API key get into the `~/.ii/` credentials file? → A: `/model` prompts securely for the key when it is missing or invalid, then stores it (Option A).
- Q: How does the user interact with the `/model` command to pick a model? → A: Both — bare `/model` lists models interactively, `/model <name>` switches directly (Option A).
- Q: Does the existing Anthropic key also move to the `~/.ii/` credentials file, or only the Meta key? → A: Both keys move to the `~/.ii/` file with secure prompting (Option B).
- Q: Which models does bare `/model` list? → A: Extensible list ready for future models beyond these two (Option C).
- Q: How are the model choice and keys organized under `~/.ii/`? → A: Two files — model preference file plus a separate credentials file (Option A).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use Muse Spark 1.3 as the active model (Priority: P1)

A user runs the `/model` command, picks the Meta `muse-spark-1.3` model, and then chats normally: asking questions, reading files, editing code, and running shell commands through the agent loop. The choice persists across restarts via the `~/.ii/` folder.

**Why this priority**: This is the core value of the feature — without it, the model is not usable at all.

**Independent Test**: Can be fully tested by running `/model`, choosing `muse-spark-1.3`, sending a prompt that requires a tool call (e.g., "list the files in src/"), and observing a correct tool-backed answer. Delivers a working Meta-model-backed agent session.

**Acceptance Scenarios**:

1. **Given** the user has run `/model` and chosen `muse-spark-1.3` with valid credentials, **When** they send a plain chat prompt, **Then** they receive a text reply from the model.
2. **Given** the user has selected `muse-spark-1.3` via `/model`, **When** they ask something requiring a tool (read a file, list a directory), **Then** the agent invokes the tool and returns an answer grounded in the tool result.
3. **Given** the user has selected `muse-spark-1.3`, **When** the session starts, **Then** token usage continues to be reported and the conversation supports multi-turn history like any other model.
4. **Given** the user previously chose `muse-spark-1.3` via `/model`, **When** they restart `ii`, **Then** `muse-spark-1.3` is still the active model without re-selecting.
5. **Given** the user is mid-conversation on another model, **When** they run `/model` and choose `muse-spark-1.3`, **Then** the very next prompt already uses `muse-spark-1.3` with the existing conversation history intact.

---

### User Story 2 - Default flow preserved; legacy env config removed (Priority: P2)

A user who does not pick another model via `/model` continues to get the current default model and behavior. Users previously relying on `II_MODEL` migrate to `/model` (breaking change documented in FR-008).

**Why this priority**: Prevents regression for default flows while making the `II_MODEL` removal explicit and migratable.

**Independent Test**: Can be fully tested by starting `ii` with no persisted model choice (and any stale `II_MODEL` set) and confirming prompts, tools, and defaults behave as the default model.

**Acceptance Scenarios**:

1. **Given** no model is explicitly selected via `/model`, **When** the user sends a prompt, **Then** the agent uses the default model with the same tools and loop behavior as before.
2. **Given** `II_MODEL` is set in the environment, **When** the user sends a prompt, **Then** `II_MODEL` is ignored and the `/model` persisted choice (or default) governs.

---

### User Story 3 - Clear failure when the selected model cannot be used (Priority: P3)

A user selects a model (Anthropic or `muse-spark-1.3`) but its credentials are missing/invalid or the model endpoint is unreachable, and receives a clear, non-crashing error with secure re-prompting for the key.

**Why this priority**: Safety and graceful-failure guarantees require that provider failures never crash or corrupt the session.

**Independent Test**: Can be fully tested by selecting `muse-spark-1.3` with missing/invalid credentials and confirming a readable error is returned and the process stays alive.

**Acceptance Scenarios**:

1. **Given** a model is selected with missing credentials, **When** the user runs `/model`, **Then** they are securely prompted for that provider's key and the key is stored without crashing.
2. **Given** a model is selected with invalid credentials, **When** a request fails, **Then** the user receives a readable error, is securely re-prompted for the key, and the agent does not crash.
3. **Given** a failed request on the selected model, **When** the user fixes the configuration and retries, **Then** the session continues to work (history is not corrupted).

---

### Edge Cases

- What happens when the model name is misspelled or an unknown model is selected? System reports a clear error identifying the problem instead of crashing or silently falling back.
- How does the system handle a mid-conversation provider outage (network failure, rate limit)? The failure surfaces as a graceful error result; history remains intact and a retry is possible.
- What happens when the Meta model returns tool calls in a different shape than expected? Unrecognized or malformed tool calls surface as tool error results, never as crashes.
- What happens when the Meta model returns an empty or text-only response? It is handled the same as any other model (returned as text).
- What happens when `II_MODEL` is set (legacy)? It is ignored; the `/model` persisted choice (or default) governs, and docs explain the migration.
- What happens when a provider key is set via environment (legacy `ANTHROPIC_API_KEY` style)? It is ignored; keys come solely from the `~/.ii/` credentials file, and docs explain the migration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `/model` command in two forms — bare `/model` lists available models interactively (showing the current one) and `/model <name>` switches directly to the named model — backed by an extensible model registry shipping with the default model and `muse-spark-1.3` (Meta); the selection MUST take effect immediately for the next prompt while keeping existing conversation history, persist across restarts in the `~/.ii/` folder, and the default remains unchanged until the user selects otherwise.
- **FR-002**: System MUST route the full agentic loop — message history, tool definitions, tool execution, and replies — through the selected model, so all existing tools work with `muse-spark-1.3` without per-tool changes.
- **FR-003**: System MUST preserve the existing default model and behavior when the user has not selected another model via `/model` (opt-in only). The legacy `II_MODEL` environment variable is removed; the `/model` persisted choice is the sole selection mechanism, and a set-but-now-ignored `II_MODEL` MUST NOT change behavior.
- **FR-004**: System MUST store configuration in two files under `~/.ii/`: a model preference file and a separate credentials file holding both provider keys (Anthropic and Meta). The credentials file MUST carry restricted (0600) file permissions; a provider's key is required only when its model is selected. When the selected model's key is missing or invalid, `/model` MUST prompt securely for the key (never via shell-echoed input) and store it; keys MUST NOT pass through environment variables or shell history.
- **FR-005**: System MUST handle selected-model failures (missing/invalid credentials, unknown model name, network/API errors, malformed tool calls) gracefully: return a readable error, keep the process alive, and leave conversation history uncorrupted.
- **FR-006**: System MUST enforce the existing safety and loop guarantees regardless of active model: bounded tool-output size, external-command timeout, and maximum-iteration cap.
- **FR-007**: System MUST continue reporting token usage for sessions running on `muse-spark-1.3` in the same observable way as today.
- **FR-008**: System MUST document how to select models via `/model` (persisted location, credential file requirements for both providers, and default behavior), including the removal of `II_MODEL` and `ANTHROPIC_API_KEY`-via-env migration to the `~/.ii/` credentials file.

### Key Entities

- **Model Selection**: Which language model backs the agent session (default vs. `muse-spark-1.3`); chosen via the `/model` command, persisted in the `~/.ii/` folder, defaults to current behavior until changed.
- **Model Preference**: The persisted record of the user's chosen model (model preference file under `~/.ii/`); read at startup and updated by the `/model` command.
- **Credentials Store**: The separate credentials file under `~/.ii/` holding provider keys (0600 permissions); read on demand when the selected model needs its key, updated via secure `/model` prompting.
- **Conversation Session**: In-memory message history plus tool results for the active session; must remain consistent and uncorrupted across provider errors and model switches via explicit reset.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch to `muse-spark-1.3` via the `/model` command and complete a tool-backed task (e.g., read a file and summarize it) successfully on the first attempt.
- **SC-002**: Users who never run `/model` observe no change in behavior — existing tasks complete as before with zero additional setup (stale `II_MODEL` values are ignored per FR-003).
- **SC-003**: 100% of failure drills (missing credentials, invalid credentials, unreachable endpoint) return a readable error without crashing or corrupting the session, verified by retrying successfully after fixing the configuration.
- **SC-004**: Time for a user to go from feature documentation to a first successful `muse-spark-1.3` response is under 10 minutes, assuming valid credentials are available.

## Assumptions

- Model identifier is `muse-spark-1.3` as supplied by the user; exact vendor naming/casing is preserved as documented by Meta.
- Model selection uses the `/model` command with persistence under `~/.ii/` per user direction, and `II_MODEL` is removed (Q5). CONSTITUTION NOTE: covered by the sanctioned `~/.ii/` exception in Principle IV (constitution 2.0.0); AGENTS.md narrowed to match.
- Configuration lives in two files under `~/.ii/` (model preference file + separate credentials file for both provider keys) per user direction, provisioned via secure `/model` prompting; credential values are never logged. CONSTITUTION NOTE: same sanctioned Principle IV exception (2.0.0) applies.
- The agentic loop semantics (history → call → tools → repeat until done, max iterations, tool contract) do not change; provider differences are hidden behind a uniform client abstraction so `src/agent.ts` control flow stays minimal, per the constitution.
- Performance and rate limits of the Meta endpoint itself are out of scope; only `ii`'s handling (timeouts, graceful errors) is in scope.
