#!/usr/bin/env node
import * as readline from "node:readline";
import { Agent } from "./agent.js";
import { defaultTools, loadToolsFromDirectory } from "./tools.js";
import type { Tool } from "./types.js";

// Export for programmatic use
export { Agent, defaultTools, loadToolsFromDirectory };
export type { Tool };

const SYSTEM_PROMPT = `You are ii, a minimalist AI coding agent running in the terminal.
You have tools to read files, write files, edit files, list directories, and run shell commands.
Work directory: ${process.cwd()}
Be concise. Use tools to inspect and modify code directly rather than explaining what you would do.`;

// Run CLI only if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  // Load custom tools from II_TOOLS_DIR if set
  let tools = [...defaultTools];
  const toolsDir = process.env.II_TOOLS_DIR;
  if (toolsDir) {
    try {
      const customTools = await loadToolsFromDirectory(toolsDir);
      tools.push(...customTools);
      console.error(`Loaded ${customTools.length} custom tool(s) from ${toolsDir}`);
    } catch (e) {
      console.error(`Warning: Failed to load custom tools: ${(e as Error).message}`);
    }
  }

  const agent = new Agent(SYSTEM_PROMPT, tools);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: "\nii> ",
  });

  console.log("ii — minimalist AI coding agent  (type /exit to quit, /clear to reset)\n");

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === "/exit" || input === "/quit") {
      process.exit(0);
    }

    if (input === "/clear") {
      agent.clearHistory();
      console.log("History cleared.");
      rl.prompt();
      return;
    }

    try {
      process.stdout.write("\n");
      let firstChunk = true;
      const response = await agent.prompt(input, (text) => {
        if (firstChunk) {
          firstChunk = false;
        }
        process.stdout.write(text);
      });
      if (!response) process.stdout.write("(done)");
      process.stdout.write("\n");
    } catch (e) {
      console.error("Error:", (e as Error).message);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nBye.");
    process.exit(0);
  });
}
