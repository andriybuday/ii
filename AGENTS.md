# AGENTS.md - Contributing to ii

This file provides instructions for AI coding agents working on the ii project.

## Project Overview

**ii** is a minimalist AI coding agent built in TypeScript/Node.js. The core philosophy is simplicity: ~80 lines of core logic implementing an agentic loop around three primitives (message history, tool registry, LLM call).

## Architecture

```
src/
  types.ts   — Tool interface (7 lines)
  tools.ts   — Tool implementations (read_file, write_file, list_dir, bash, edit_file)
  agent.ts   — The agentic loop (~80 lines) - THE CORE
  index.ts   — CLI REPL and programmatic exports
```

### Core Principles

1. **Minimalism**: The agent loop in `agent.ts` is the whole thing. Keep it simple.
2. **Safety First**: All file operations must validate paths stay within cwd.
3. **No Feature Creep**: Resist adding complexity. The value is in the minimal implementation.
4. **Tool Simplicity**: Tools return strings. Keep outputs concise (<10k chars).

## Development Workflow

### Setup

```bash
npm install
npm run build
```

### Running

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev          # Run from TypeScript source
# OR
npm run build && npm start  # Run from compiled JavaScript
```

### Testing Changes

After making changes:
1. Run `npm run build` to verify TypeScript compiles
2. Test manually with `npm run dev`
3. Verify the agent can still perform basic operations (list files, read files, etc.)

## Code Conventions

### TypeScript

- Use ES modules (`import`/`export`)
- Target Node.js >= 20
- Keep types simple; avoid complex generics
- The `Tool` interface is in `src/types.ts` - do not modify without good reason

### Tool Implementation

When adding or modifying tools in `src/tools.ts`:

1. **Path Validation**: Always call `validatePath()` for file operations
2. **Output Truncation**: Always wrap return values with `truncateOutput()`
3. **Error Handling**: Catch exceptions and return error strings (don't throw)
4. **Security**: Never allow path traversal outside cwd
5. **Timeouts**: Set reasonable timeouts for external commands (bash tool uses 30s)

Example tool structure:
```ts
export const myTool: Tool<{ param: string }> = {
  name: "my_tool",
  description: "Clear description for the LLM",
  inputSchema: { /* JSON Schema */ },
  async execute({ param }) {
    const validationError = validatePath(param);
    if (validationError) return validationError;
    try {
      // Implementation
      return truncateOutput(result);
    } catch (e) {
      return truncateOutput(`Error: ${(e as Error).message}`);
    }
  },
};
```

### Agent Loop (src/agent.ts)

The agent loop is the heart of the project. When modifying:

1. **Preserve the loop structure**: The for-loop with MAX_ITERATIONS is intentional
2. **Token tracking**: Update token counters when API calls succeed
3. **Error handling**: API errors should return gracefully, not crash
4. **History management**: Always push to history before processing

Do NOT add:
- Complex state management
- Multiple agent instances
- Streaming complexity (onText callback is sufficient)
- Conversation branching or tree structures

## Safety Requirements

All changes MUST maintain these safety guarantees:

1. **Path Traversal Protection**: `validatePath()` must be called for all file operations
2. **Max Iterations**: Agent loop must have MAX_ITERATIONS limit (currently 50)
3. **Output Size Limits**: All tool outputs must be truncated at 10k chars
4. **API Error Handling**: Network failures must not crash the agent
5. **Command Timeouts**: Bash tool must have timeout (currently 30s)

## Making Changes

### Adding a New Tool

1. Add tool implementation to `src/tools.ts`
2. Export it in the `defaultTools` array
3. Update README.md if it's a core tool
4. For optional tools, add to `tools/` directory as an example instead

### Modifying the Agent Loop

The agent loop is intentionally minimal. Before modifying `src/agent.ts`:

1. Ask: "Does this maintain the ~80 line simplicity?"
2. Ask: "Is this essential for safety or core functionality?"
3. If adding features, consider if they belong in a custom tool instead

### Extensibility Changes

The project supports extensibility via:
- `II_TOOLS_DIR` env var for custom tools
- Programmatic API via exports from `src/index.ts`
- `II_MODEL` env var for model selection

When adding extensibility features:
- Keep them opt-in (don't change default behavior)
- Use environment variables, not config files
- Document in README.md and tools/README.md

## Commit Guidelines

- Each safety fix should be a separate commit
- Extensibility features can be grouped logically
- Commit messages should explain the "why", not just the "what"
- Keep commits atomic and reviewable

Example:
```
Add path traversal protection to file tools

- Add validatePath() helper that ensures paths stay within cwd
- Apply validation to read_file, write_file, list_dir, and edit_file tools
- Prevents malicious or accidental access to files outside workspace
```

## Testing Checklist

Before submitting changes:

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] Agent starts without errors (`npm run dev`)
- [ ] Basic operations work: list_dir, read_file, bash
- [ ] Path traversal is blocked (try `read_file` with `../../../etc/passwd`)
- [ ] Tool output truncation works (try reading a large file)
- [ ] Max iterations limit works (agent doesn't loop forever)
- [ ] Token usage is logged to stderr

## Common Tasks

### Update the Model

Change the default model in `src/agent.ts`:
```ts
const MODEL = process.env.II_MODEL || "claude-sonnet-4-5";
```

### Add a Custom Tool (for users, not core)

Create a file in `tools/` directory, see `tools/README.md` for instructions.

### Modify System Prompt

The system prompt is in `src/index.ts`. Keep it concise and focused on the minimalist nature.

## What NOT to Do

- Do NOT add config file parsing (use env vars)
- Do NOT add complex CLI argument parsing (keep it simple)
- Do NOT add conversation persistence (history is in-memory only)
- Do NOT add multiple agent coordination
- Do NOT add streaming UI complexity
- Do NOT remove safety checks for "convenience"
- Do NOT increase the core loop beyond ~100 lines without strong justification

## Questions?

If unsure about a change:
1. Check if it maintains minimalism
2. Check if it preserves safety guarantees
3. Ask: "Would this still be understandable in one sitting?"
4. When in doubt, prefer the simpler solution
