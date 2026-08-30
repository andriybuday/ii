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
import { buildCommandRegistry, AutocompleteComponent } from "./autocomplete.js";
import { UXManager, isAutocompleteEnabled } from "./ux.js";

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

  // Build command registry for autocomplete (built-ins + skills, sorted)
  const registry = buildCommandRegistry(skills);

  // Optional autocomplete wiring — gated on TTY (FR-013 pre-flight)
  const autocompleteEnabled = isAutocompleteEnabled();
  let ux: UXManager | null = null;
  let autocomplete: AutocompleteComponent | null = null;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: "\nii> ",
  });

  if (autocompleteEnabled) {
    try {
      ux = new UXManager();
      autocomplete = new AutocompleteComponent(registry, rl, ux);
      ux.register(autocomplete);

      // readline (terminal: true) registers its own "keypress" listener on
      // process.stdin during createInterface() above — that listener is what
      // actually submits the line on Enter, inserts characters, navigates
      // history on ArrowUp/Down, and inserts a literal tab on Tab. Because it
      // was registered first, it always ran *before* any listener we add here,
      // which made it impossible to intercept those keys: Enter had already
      // submitted the untouched buffer, ArrowUp/Down had already overwritten
      // it with history, and Tab had already inserted "\t" — autocomplete's own
      // handling then ran too late, on stale or corrupted state.
      //
      // To fix that we detach readline's own listener and drive it ourselves:
      // our handler runs first, decides whether autocomplete wants to consume
      // the key, and only forwards to readline's default handling when it
      // doesn't. This is the standard technique for layering custom key
      // handling on top of `readline.Interface` without reimplementing it.
      const defaultKeypressListeners = process.stdin.listeners("keypress").slice() as Array<
        (str: string, key: { name: string; ctrl?: boolean; shift?: boolean; sequence: string }) => void
      >;
      process.stdin.removeAllListeners("keypress");

      const keypressHandler = (str: string, key: { name: string; ctrl?: boolean; shift?: boolean; sequence: string }) => {
        if (!ux || !autocomplete) {
          for (const l of defaultKeypressListeners) l.call(process.stdin, str, key);
          return;
        }
        const k = { name: key.name ?? str, ctrl: !!key.ctrl, shift: !!key.shift, sequence: key.sequence ?? str };
        const line = (rl as unknown as { line: string }).line ?? "";
        const cursor = (rl as unknown as { cursor: number }).cursor ?? line.length;
        let consumed = false;
        try {
          consumed = ux.onKeypress(k, line, cursor);
        } catch {
          consumed = false;
        }
        if (!consumed) {
          for (const l of defaultKeypressListeners) l.call(process.stdin, str, key);
          // Re-derive buffer state only now that readline's default handling
          // (character insertion, backspace, history nav, ...) has actually
          // run, and let the component recompute/render/dismiss accordingly.
          //
          // This is skipped when the key was consumed: the component's own
          // handleKey already decided the resulting `visible`/`selectedIndex`
          // for that key (e.g. Tab-cycling deliberately places the cursor
          // right after the completed command + a trailing space, which no
          // longer looks like a "/" token — probing wantsInput() here would
          // immediately dismiss the list Tab just drew, breaking cycling).
          try {
            const curLine = (rl as unknown as { line: string }).line ?? "";
            const curCursor = (rl as unknown as { cursor: number }).cursor ?? curLine.length;
            autocomplete.onLineChange(curLine, curCursor);
            ux.onLineChange(curLine, curCursor);
          } catch (e) {
            console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
            ux.disable("autocomplete");
          }
        }
      };
      process.stdin.on("keypress", keypressHandler);

      // Terminal resize — re-render with new width (no recompute needed)
      const resizeHandler = () => {
        try {
          ux?.onResize();
        } catch (e) {
          console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
          ux?.disable("autocomplete");
        }
      };
      process.stdout.on("resize", resizeHandler);

      // Teardown on close — remove listeners, clear suggestions, restore readline's own handling
      rl.on("close", () => {
        try {
          process.stdin.off("keypress", keypressHandler);
          process.stdout.off("resize", resizeHandler);
          autocomplete?.dismiss();
        } catch {}
      });
    } catch (e) {
      console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
      // Leave autocomplete disabled; REPL falls back to plain readline (FR-013)
      ux = null;
      autocomplete = null;
    }
  }

  console.log("ii — minimalist AI coding agent  (type /exit to quit, /clear to reset)\n");

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    // Clear bottom suggestions before handling line (so old block doesn't linger above new output)
    if (autocomplete) {
      try { autocomplete.dismiss(); } catch {}
    }

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
