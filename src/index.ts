#!/usr/bin/env node
import * as readline from "node:readline";
import { Agent } from "./agent.js";
import { defaultTools } from "./tools.js";

const SYSTEM_PROMPT = `You are ii, a minimalist AI coding agent running in the terminal.
You have tools to read files, write files, edit files, list directories, and run shell commands.
Work directory: ${process.cwd()}
Be concise. Use tools to inspect and modify code directly rather than explaining what you would do.`;

const agent = new Agent(SYSTEM_PROMPT, defaultTools);

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
