#!/usr/bin/env node
import * as readline from "node:readline";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "./agent.js";
import { defaultTools, loadToolsFromDirectory } from "./tools.js";
import type { Tool } from "./types.js";
import { discoverSkillsFrom, mergeSkillSources, resolveCommand, substituteArguments } from "./skills.js";
import type { Skill } from "./skills.js";

// Export for programmatic use
export { Agent, defaultTools, loadToolsFromDirectory, discoverSkillsFrom, mergeSkillSources, resolveCommand, substituteArguments };
export type { Tool, Skill };

// Run CLI only if this file is executed directly (not imported)
const isMainModule = (() => {
  try {
    const modulePath = realpathSync(fileURLToPath(import.meta.url));
    // process.argv[1] may be a symlink (e.g. the global `ii` bin created by
    // `npm link`), so resolve it to its real path before comparing.
    const scriptPath = process.argv[1] ? realpathSync(resolve(process.argv[1])) : "";
    return modulePath === scriptPath;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  function loadAgentsMd(): string {
    try {
      const agentsMdPath = join(process.cwd(), "AGENTS.md");
      if (existsSync(agentsMdPath)) {
        const content = readFileSync(agentsMdPath, "utf-8");
        return `\n\n# Project Instructions (from AGENTS.md)\n\n${content}`;
      }
    } catch (e) {
      // Silently ignore errors reading AGENTS.md
    }
    return "";
  }

  const SYSTEM_PROMPT = `You are ii, a minimalist AI coding agent running in the terminal.
You have tools to read files, write files, edit files, list directories, and run shell commands.
Work directory: ${process.cwd()}
Be concise. Use tools to inspect and modify code directly rather than explaining what you would do.${loadAgentsMd()}`;

  // Load custom tools from II_TOOLS_DIR if set
  let tools = [...defaultTools];
  const toolsDir = process.env.II_TOOLS_DIR;
  if (toolsDir) {
    try {
      const customTools = await loadToolsFromDirectory(toolsDir);
      // Deduplicate by name: custom tools override built-ins
      const toolMap = new Map<string, typeof tools[0]>();
      for (const tool of tools) {
        toolMap.set(tool.name, tool);
      }
      for (const tool of customTools) {
        if (toolMap.has(tool.name)) {
          console.error(`Warning: Custom tool "${tool.name}" overrides built-in tool`);
        }
        toolMap.set(tool.name, tool);
      }
      tools = Array.from(toolMap.values());
      console.error(`Loaded ${customTools.length} custom tool(s) from ${toolsDir}`);
    } catch (e) {
      console.error(`Warning: Failed to load custom tools: ${(e as Error).message}`);
    }
  }

  const agent = new Agent(SYSTEM_PROMPT, tools);

  // Discover skills from .ii/skills/ (ii-native) and .claude/skills/ (Claude Code
  // compatible). Both are scanned automatically — no opt-in/env var required (FR-012).
  // .claude/skills is merged first so .ii/skills wins on a name collision (FR-005).
  const claudeSkills = discoverSkillsFrom(".claude/skills", "claude-compatible");
  const iiSkills = discoverSkillsFrom(".ii/skills", "ii-native");
  const skills = mergeSkillSources(claudeSkills, iiSkills);
  if (skills.size > 0) {
    console.error(
      `Loaded ${skills.size} skill(s): ${iiSkills.size} from .ii/skills, ${claudeSkills.size} from .claude/skills`
    );
  }

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

    const resolved = resolveCommand(input, skills);

    if (resolved.kind === "builtin") {
      if (resolved.builtinName === "exit" || resolved.builtinName === "quit") {
        process.exit(0);
      }
      // builtinName === "clear"
      agent.clearHistory();
      console.log("History cleared.");
      rl.prompt();
      return;
    }

    // A matched skill's instructions (with arguments substituted) are submitted as an
    // ordinary turn in the same ongoing history — no new, isolated call (FR-013).
    const prompt =
      resolved.kind === "skill"
        ? substituteArguments(resolved.skill.body, resolved.args)
        : input; // resolved.kind === "none" — fall through unchanged (FR-010)

    try {
      process.stdout.write("\n");
      let firstChunk = true;
      const response = await agent.prompt(prompt, (text) => {
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
