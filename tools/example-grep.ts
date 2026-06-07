import { execSync } from "node:child_process";
import type { Tool } from "../src/types.js";

/**
 * Example custom tool: grep
 * 
 * This tool searches for text patterns in files using ripgrep (rg) or grep.
 * Copy this file to create your own custom tools.
 */

export const grep: Tool<{ pattern: string; path?: string }> = {
  name: "grep",
  description: "Search for text patterns in files using ripgrep or grep",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { 
        type: "string", 
        description: "Text pattern to search for (regex supported)" 
      },
      path: { 
        type: "string", 
        description: "Directory or file to search in (default: current directory)" 
      },
    },
    required: ["pattern"],
  },
  async execute({ pattern, path = "." }) {
    try {
      // Try ripgrep first (faster), fall back to grep
      let command: string;
      try {
        execSync("which rg", { stdio: "ignore" });
        command = `rg -n "${pattern}" ${path} 2>/dev/null | head -50`;
      } catch {
        command = `grep -rn "${pattern}" ${path} 2>/dev/null | head -50`;
      }
      
      const output = execSync(command, {
        encoding: "utf-8",
        timeout: 10_000,
      });
      
      return output || "(no matches found)";
    } catch (e) {
      return `Error searching: ${(e as Error).message}`;
    }
  },
};
