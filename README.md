# ii

A minimalist AI coding agent. ~70 lines of core logic.

## What it is

A tight loop around three primitives:

1. **Message history** — the agent's memory
2. **Tool registry** — read file, write file, run shell
3. **LLM call** — Claude Sonnet via Anthropic SDK

Built tool call → loop back → until `end_turn`. That's it.

## Install

```bash
npm install
npm run build
npm link   # makes `ii` available globally
```

Or run directly:

```bash
npm run dev
```

On first run, use `/model` to pick a model — you will be securely prompted for
that provider's API key, which is stored in `~/.ii/credentials.json` (0600).

## Usage

```
ii> list the files in src/
ii> read src/agent.ts and explain the loop
ii> add error handling to the bash tool
/clear   # reset conversation history
/exit    # quit
/model                # list available models (marks the current one)
/model muse-spark-1.3-contributor # switch to Meta Muse Spark 1.3 Contributor (takes effect immediately)
```

Model choice persists in `~/.ii/model.json`; both provider keys live in
`~/.ii/credentials.json` and are never read from the environment.

### Skill commands

Drop a skill (a markdown file with `name`/`description` frontmatter, plus a body) at
`.ii/skills/<name>/SKILL.md` — or `.claude/skills/<name>/SKILL.md` if you already have
skills from Claude Code — and invoke it as a slash command:

```
ii> /my-skill some arguments
```

Text after the name replaces `$ARGUMENTS` in the skill's body. Use `/skill:<name>` to
reach a skill whose name collides with a built-in command or with a lower-precedence
skill. See `AGENTS.md`'s "Skill Commands" section for the full discovery/precedence
rules.

## Architecture

```
src/
  types.ts   — Tool interface
  tools.ts   — read_file, write_file, bash, edit_file, list_dir
  agent.ts   — the agentic loop (~80 lines)
  index.ts   — CLI REPL
```

The agent loop in `agent.ts` is the whole thing:

1. Append user message to history
2. Call LLM with full history + tools
3. If `stop_reason === "tool_use"` → execute tools in parallel, append results, go to 2
4. If `stop_reason === "end_turn"` → return text

## Adding tools

### Programmatic API

```ts
import { Agent } from "ii";
import type { Tool } from "ii";

const myTool: Tool<{ query: string }> = {
  name: "my_tool",
  description: "Does something useful",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  async execute({ query }) {
    return `result for ${query}`;
  },
};

const agent = new Agent("You are helpful.", [myTool]);
const reply = await agent.prompt("use my_tool with query hello");
```

### Custom Tools Directory

Set `II_TOOLS_DIR` to load tools from a directory:

```bash
export II_TOOLS_DIR=./tools
ii
```

See `tools/` directory for example custom tools (grep, git status/diff).

Each `.ts` or `.js` file in the directory is imported, and all exported Tool objects are registered.

## Environment Variables

- `ANTHROPIC_WORKSPACE_ID` (optional) — Required by some identity-linked API keys; if you
  see `anthropic-workspace-id is required when authenticating with an identity-linked API
  key`, set this to the workspace ID the request should act in
- `II_TOOLS_DIR` (optional) — Directory containing custom tool files

Provider API keys are NOT read from the environment — `/model` prompts for them
securely and stores them in `~/.ii/credentials.json` (0600).

### Migrating from older versions

- `II_MODEL` is removed; run `/model` to pick a model (persisted in `~/.ii/model.json`).
- `ANTHROPIC_API_KEY` via env is ignored; run `/model`, select the Anthropic model,
  and enter the key at the secure prompt to store it in `~/.ii/credentials.json`.

## Requirements

- Node.js >= 20
- A provider API key (provisioned via `/model` on first run)
