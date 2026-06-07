# Custom Tools for ii

This directory contains example custom tools that you can use to extend the ii agent.

## Using Custom Tools

Set the `II_TOOLS_DIR` environment variable to load tools from a directory:

```bash
export II_TOOLS_DIR=./tools
ii
```

Or for a one-off:

```bash
II_TOOLS_DIR=./my-tools ii
```

## Creating a Custom Tool

A tool is a TypeScript/JavaScript object with the following structure:

```ts
import type { Tool } from "ii"; // or "../src/types.js" for local development

export const myTool: Tool<{ param: string }> = {
  name: "my_tool",
  description: "What this tool does",
  inputSchema: {
    type: "object",
    properties: {
      param: { 
        type: "string", 
        description: "Description of the parameter" 
      },
    },
    required: ["param"],
  },
  async execute({ param }) {
    // Tool logic here
    return `Result: ${param}`;
  },
};
```

### Tool Interface

```ts
interface Tool<TInput = any> {
  name: string;              // Unique tool name (snake_case recommended)
  description: string;       // Description for the LLM
  inputSchema: object;       // JSON Schema for parameters
  execute: (input: TInput) => Promise<string>; // Implementation
}
```

### Guidelines

1. **Return strings**: Tools should return string output (will be truncated at 10k chars)
2. **Handle errors**: Catch exceptions and return error messages as strings
3. **Be concise**: Output should be useful for the LLM, not verbose
4. **Validate inputs**: Check parameters and return helpful error messages
5. **Use timeouts**: For external commands, set reasonable timeouts

## Example Tools

### `example-grep.ts`
Search for text patterns in files using ripgrep or grep.

**Usage:**
```
ii> use grep to find "TODO" in src/
```

### `example-git.ts`
Git utilities for status and diff.

**Tools:**
- `git_status` - Show working tree status
- `git_diff` - Show diff for modified files (use `staged: true` for staged changes)

**Usage:**
```
ii> what's the git status?
ii> show me the git diff
```

## Loading Tools

Tools are loaded dynamically from the directory specified by `II_TOOLS_DIR`. Each `.ts` or `.js` file is imported, and all exported `Tool` objects are registered.

The loader looks for exports that have a `name` property (identifying them as tools).

## Security Note

Custom tools run with the same privileges as the ii agent. Only load tools from trusted sources. Tools can execute arbitrary code, read/write files (within cwd), and run shell commands.
