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
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

## Usage

```
ii> list the files in src/
ii> read src/agent.ts and explain the loop
ii> add error handling to the bash tool
/clear   # reset conversation history
/exit    # quit
```

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

- `ANTHROPIC_API_KEY` (required) — Your Anthropic API key
- `II_MODEL` (optional) — Model to use (default: `claude-sonnet-4-5`)
- `II_TOOLS_DIR` (optional) — Directory containing custom tool files

## Requirements

- Node.js >= 20
- `ANTHROPIC_API_KEY` environment variable
