import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Tool } from "./types.js";

export const readFile: Tool<{ path: string }> = {
  name: "read_file",
  description: "Read the contents of a file at the given path",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to read" },
    },
    required: ["path"],
  },
  async execute({ path }) {
    try {
      return readFileSync(path, "utf-8");
    } catch (e) {
      return `Error reading file: ${(e as Error).message}`;
    }
  },
};

export const writeFile: Tool<{ path: string; content: string }> = {
  name: "write_file",
  description: "Write content to a file, creating parent directories as needed",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to write" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
  async execute({ path, content }) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf-8");
      return `Wrote ${content.length} bytes to ${path}`;
    } catch (e) {
      return `Error writing file: ${(e as Error).message}`;
    }
  },
};

export const bash: Tool<{ command: string }> = {
  name: "bash",
  description:
    "Run a shell command and return stdout + stderr. Avoid long-running or interactive commands.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
    },
    required: ["command"],
  },
  async execute({ command }) {
    try {
      const output = execSync(command, {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return output || "(no output)";
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message: string };
      const out = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
      return `Error:\n${out}`;
    }
  },
};

export const defaultTools: Tool[] = [readFile, writeFile, bash];
