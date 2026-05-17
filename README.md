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

## Architecture

```
src/
  types.ts   — Tool interface
  tools.ts   — read_file, write_file, bash
  agent.ts   — the agentic loop (~50 lines)
  index.ts   — CLI REPL
```

The agent loop in `agent.ts` is the whole thing:

1. Append user message to history
2. Call LLM with full history + tools
3. If `stop_reason === "tool_use"` → execute tools in parallel, append results, go to 2
4. If `stop_reason === "end_turn"` → return text

## Adding tools

```ts
import { Agent } from "./src/agent.js";
import type { Tool } from "./src/types.js";

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

## Requirements

- Node.js >= 20
- `ANTHROPIC_API_KEY` environment variable
