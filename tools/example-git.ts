import { execSync } from "node:child_process";
import type { Tool } from "../src/types.js";

/**
 * Example custom tool: git_status
 * 
 * This tool shows git repository status.
 * Demonstrates how to create a simple wrapper around a CLI command.
 */

const MAX_OUTPUT_SIZE = 10000;

function truncateOutput(output: string): string {
  if (output.length > MAX_OUTPUT_SIZE) {
    return output.slice(0, MAX_OUTPUT_SIZE) + `\n... (truncated ${output.length - MAX_OUTPUT_SIZE} characters)`;
  }
  return output;
}

export const gitStatus: Tool<{ }> = {
  name: "git_status",
  description: "Show git repository status (modified files, branch, etc.)",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute() {
    try {
      const output = execSync("git status --short", {
        encoding: "utf-8",
        timeout: 5_000,
      });
      
      if (!output.trim()) {
        return "Working tree clean";
      }
      
      return truncateOutput(output);
    } catch (e) {
      return truncateOutput(`Error: Not a git repository or git not installed`);
    }
  },
};

/**
 * Example custom tool: git_diff
 * 
 * Shows git diff for modified files.
 */

export const gitDiff: Tool<{ staged?: boolean }> = {
  name: "git_diff",
  description: "Show git diff for modified files",
  inputSchema: {
    type: "object",
    properties: {
      staged: { 
        type: "boolean", 
        description: "Show staged changes only (default: false)" 
      },
    },
    required: [],
  },
  async execute({ staged = false }) {
    try {
      const command = staged ? "git diff --cached" : "git diff";
      const output = execSync(command, {
        encoding: "utf-8",
        timeout: 5_000,
        maxBuffer: 1024 * 1024, // 1MB max
      });
      
      return truncateOutput(output || "(no changes)");
    } catch (e) {
      return truncateOutput(`Error getting diff: ${(e as Error).message}`);
    }
  },
};
