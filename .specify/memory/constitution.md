<!--
SYNC IMPACT REPORT
Version change: 1.1.0 → 1.2.0
Rationale: MINOR bump — materially expanded guidance across four existing principles and
one existing section, no principle removed or redefined incompatibly. Folds in gaps found
by re-reading the full commit history and tools/README.md that weren't yet captured.
Modified principles:
  - I. Radical Minimalism — added a clause on AGENTS.md's token-budget cost since it is
    loaded into every system prompt at startup.
  - II. Safety by Default — added a clause on the custom-tool trust boundary (`II_TOOLS_DIR`
    is not a sandbox; docs must keep saying so).
  - III. Fail Gracefully, Never Corrupt State — added the tool-result error-signaling
    contract (`is_error: true`, not string-matched "Error:" prefixes).
  - V. Transparent Text-Based Interface — added tool-registration deduplication by name,
    and the stdout/stderr logging separation.
Modified sections:
  - Technology & Compatibility Constraints — generalized the symlink/npm-link CLI-detection
    rule into a standing constraint on resolving real/canonical paths for any entry-point or
    module-identity detection.
  - Development & Review Workflow — added a rule against side effects at module-import time.
Added sections: none
Removed sections: none
Deferred placeholders: none
Templates requiring downstream review (not modified by this command; see Scope Guard):
  - .specify/templates/ (plan/spec/tasks scaffolds) — confirm alignment with principles above
Follow-up TODOs: none

Prior report (1.1.0): permitted multi-provider LLM extensibility (OpenAI, Meta/Llama)
under Principle I and Technology & Compatibility Constraints.
Prior report (1.0.0, initial ratification): no prior constitution existed — only the
unfilled placeholder scaffold. Formalized principles already practiced and recorded
informally in AGENTS.md and enforced through the project's commit history.
-->

# ii Constitution

## Core Principles

### I. Radical Minimalism
The agentic loop and its three primitives — message history, tool registry, LLM call —
MUST remain small enough to read and understand in one sitting. `src/agent.ts` MUST NOT
grow beyond ~100 lines without a documented justification recorded in the commit or PR
description. Before adding any capability to the core, the change MUST answer: "Does this
maintain the loop's simplicity?" and "Is this essential for safety or core functionality?"
Capabilities that are optional or user-specific belong in a custom tool (loaded via
`II_TOOLS_DIR`) or the `tools/` directory, not in the core.

Minimalism constrains implementation complexity, not integration breadth. Supporting
multiple LLM providers (e.g., Anthropic, OpenAI, Meta/Llama) MUST be treated as permitted
extensibility, not scope creep, provided each provider is integrated behind a single,
generic client abstraction that the core loop calls uniformly — not bespoke per-provider
branching sprinkled through `agent.ts`. Adding a provider is judged by the complexity it
adds to the core loop's control flow, not by the number of provider SDKs the project
depends on.
**Rationale**: The project's entire reason for existing is being a legible, ~70-80 line
agent loop (README, AGENTS.md). Every other principle in this document is a boundary that
protects this one. That boundary is about the loop's legibility, not about locking the
project to a single vendor — swapping or adding providers is a reasonable, expected use
case and should not be read as forbidden by this principle.

Any file loaded into the system prompt at startup (e.g., `AGENTS.md`) is a recurring token
cost paid on every request, not just documentation. It MUST be kept concise, and additions
to it MUST be weighed against that budget the same way additions to the core loop are.

### II. Safety by Default
All file-system operations MUST validate that resolved paths stay within the working
directory before acting (no path traversal). All tool outputs MUST be truncated to a
bounded size (currently 10k chars) before being returned to the model, to prevent context
overflow. Any input that reaches a shell or subprocess MUST be escaped or validated so it
cannot alter command semantics. External commands (e.g., the `bash` tool) MUST enforce a
timeout (currently 30s). Safety checks MUST NOT be removed, weakened, or bypassed for
convenience or performance.

Custom tools loaded via `II_TOOLS_DIR` run with the same privileges as the agent process
itself and sit outside this principle's guarantees — the loader MUST NOT be treated as a
sandbox. Documentation for `II_TOOLS_DIR` MUST keep stating plainly that custom tools can
execute arbitrary code, read/write files within the working directory, and run shell
commands, and MUST only be loaded from trusted sources.
**Rationale**: Directly codifies AGENTS.md's "Safety Requirements" and the fixes already
shipped to enforce them (path traversal protection; shell-injection fix in the grep tool;
output truncation; command timeouts), plus the trust-boundary note already carried in
`tools/README.md`'s "Security Note" — the custom-tool loader was never meant to imply the
same guarantees as the built-in tools.

### III. Fail Gracefully, Never Corrupt State
A failing, malformed, or unrecognized tool call MUST surface as a tool error result and
MUST NOT crash the process or corrupt the in-memory message history. Tool detection MUST
verify a candidate actually implements the documented `Tool` contract (including an
`execute` method) before invoking it. API and network failures MUST be caught and
returned gracefully, never propagated as uncaught exceptions. The agent loop MUST enforce
a `MAX_ITERATIONS` cap to prevent infinite loops.

Tool failures — not-found, execution error, or any other failure — MUST be returned as a
`tool_result` with `is_error: true` set, not merely as text prefixed with "Error:". The
model relies on this flag, not string matching, to distinguish failure from success.
**Rationale**: Matches the project's own hardening history — try-catch around
`tool.execute()` to prevent history corruption, the execute-method check added to tool
detection, API error handling to prevent crashes, the max-iterations limit, and the
`is_error` flag added to tool-not-found results so failures are signaled structurally.

### IV. No Feature Creep, Opt-In Extensibility
The core MUST NOT grow config-file parsing, complex CLI argument parsing, conversation
persistence, multi-agent coordination, or streaming-UI complexity. Configuration MUST be
exposed through environment variables (e.g., `II_MODEL`, `II_TOOLS_DIR`), never through
config files. Extensibility mechanisms MUST be opt-in and MUST NOT change default
behavior when unused.
**Rationale**: Lifted directly from AGENTS.md's "What NOT to Do" and "Extensibility
Changes" sections — this is the project's own pre-existing, explicit governance intent,
now made binding.

### V. Transparent Text-Based Interface
Every capability MUST be reachable through the CLI's text protocol (stdin/args → stdout,
errors → stderr) and through the programmatic API (`Agent`, `Tool` exports). No capability
may exist only behind an undocumented or hidden path. Every tool MUST declare an explicit
`name`, `description`, and JSON-schema `inputSchema` per the `Tool` interface in
`src/types.ts`; that interface MUST NOT be modified without strong justification, since
tool discovery and detection logic depend on its exact shape.

Tool registration MUST deduplicate by `name` before tools are sent to the API — two tools
sharing a name is a registration-time error, not a runtime one. Diagnostic and operational
output (token usage, startup messages, warnings) MUST go to stderr; stdout is reserved for
the agent's user-facing text output, and this separation MUST be preserved so the CLI stays
scriptable.
**Rationale**: Matches the README's CLI and programmatic-API sections, and the tool-
detection fixes shipped to keep discovery correct (execute-method check, CLI detection
when run via symlink/`npm link`, deduplicating custom tools by name to prevent API errors,
and logging token usage to stderr rather than stdout).

## Technology & Compatibility Constraints

The runtime MUST target Node.js >= 20. TypeScript MUST compile cleanly via `tsc` (`npm run
build`) with no type errors before any change is merged. The CLI MUST behave correctly
regardless of invocation path, including when installed via `npm link` or invoked through
a symlink. Entry-point, REPL, and module-identity detection (e.g., determining whether a
file was invoked directly as the CLI) MUST resolve real/canonical paths — resolving
symlinks — rather than comparing raw `argv` or module-path strings, since naive string
comparison is what broke under `npm link` and symlinked installs before. Core runtime
dependencies MUST stay minimal in terms of what the core loop directly imports and branches
on. `@anthropic-ai/sdk` is the first-class LLM client today;
additional provider SDKs (e.g., OpenAI, Meta/Llama) MAY be added as dependencies without
that alone violating Principle I, provided they are introduced behind a common client
abstraction the core loop calls generically. A dependency that is not an LLM-provider
client still requires explicit justification weighed against Principle I.

## Development & Review Workflow

Before a change is submitted: `npm run build` MUST succeed with no TypeScript errors, the
agent MUST start without errors (`npm run dev`), and — for changes touching tools or the
agent loop — the manual checklist in AGENTS.md MUST be walked through (path traversal is
blocked, output truncation works, the max-iterations limit holds, token usage is logged).
Safety fixes MUST be committed separately from feature or extensibility work, and commit
messages MUST explain *why* a change was made, not just *what* changed. Modules MUST NOT
perform I/O or other side effects as a consequence of being imported; side effects (such as
loading `AGENTS.md` into the system prompt) MUST happen during explicit initialization or
construction, not at module-evaluation time. Any change to `src/agent.ts` or
`src/types.ts` MUST be explicitly evaluated against Principle I (line-count budget) and
Principle III (fault isolation) before it is approved.

## Governance

This constitution supersedes AGENTS.md and any other informal contribution notes wherever
they conflict; AGENTS.md remains the day-to-day operational how-to guide and MUST be kept
consistent with this document. All PRs and reviews MUST verify compliance with the
principles above — unjustified complexity, scope creep, or removal of a safety check MUST
block merge until resolved or explicitly justified in the review record.

**Amendment procedure**: propose the change with a documented rationale, update this file,
bump the version per the policy below, and refresh the Sync Impact Report at the top of
this file in the same change.

**Versioning policy** (semantic versioning applied to governance):
- **MAJOR**: backward-incompatible removal or redefinition of a principle.
- **MINOR**: a new principle or section, or materially expanded guidance.
- **PATCH**: wording, typo, or clarification fixes with no semantic change.

**Version**: 1.2.0 | **Ratified**: 2026-08-30 | **Last Amended**: 2026-08-30
