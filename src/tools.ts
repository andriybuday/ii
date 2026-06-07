import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Tool } from "./types.js";

function validatePath(inputPath: string): string | null {
  const resolved = resolve(inputPath);
  const cwd = process.cwd();
  if (!resolved.startsWith(cwd + "/") && resolved !== cwd) {
    return `Error: Path "${inputPath}" is outside the working directory`;
  }
  return null;
}

const MAX_OUTPUT_SIZE = 10000;

function truncateOutput(output: string): string {
  if (output.length > MAX_OUTPUT_SIZE) {
    return output.slice(0, MAX_OUTPUT_SIZE) + `\n... (truncated ${output.length - MAX_OUTPUT_SIZE} characters)`;
  }
  return output;
}

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
    const validationError = validatePath(path);
    if (validationError) return validationError;
    try {
      const content = readFileSync(path, "utf-8");
      return truncateOutput(content);
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
    const validationError = validatePath(path);
    if (validationError) return validationError;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf-8");
      return truncateOutput(`Wrote ${content.length} bytes to ${path}`);
    } catch (e) {
      return truncateOutput(`Error writing file: ${(e as Error).message}`);
    }
  },
};

export const listDir: Tool<{ path: string }> = {
  name: "list_dir",
  description: "List files and directories in the given path",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path to list" },
    },
    required: ["path"],
  },
  async execute({ path }) {
    const validationError = validatePath(path);
    if (validationError) return validationError;
    try {
      const entries = readdirSync(path, { withFileTypes: true });
      const output = entries
        .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
        .join("\n");
      return truncateOutput(output);
    } catch (e) {
      return `Error listing directory: ${(e as Error).message}`;
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
      return truncateOutput(output || "(no output)");
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message: string };
      const out = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
      return truncateOutput(`Error:\n${out}`);
    }
  },
};

export const editFile: Tool<{
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}> = {
  name: "edit_file",
  description:
    "Edit a file by replacing text. Provide the exact old_string to replace with new_string. Set replace_all to true to replace all occurrences.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to edit" },
      old_string: { type: "string", description: "Exact text to find and replace" },
      new_string: { type: "string", description: "Replacement text" },
      replace_all: {
        type: "boolean",
        description: "Replace all occurrences (default false)",
      },
    },
    required: ["path", "old_string", "new_string"],
  },
  async execute({ path, old_string, new_string, replace_all }) {
    const validationError = validatePath(path);
    if (validationError) return validationError;
    try {
      const content = readFileSync(path, "utf-8");
      if (!content.includes(old_string)) {
        return truncateOutput(`Error: old_string not found in ${path}`);
      }
      const newContent = replace_all
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string);
      writeFileSync(path, newContent, "utf-8");
      const count = replace_all
        ? content.split(old_string).length - 1
        : 1;
      return truncateOutput(`Edited ${path}: replaced ${count} occurrence(s)`);
    } catch (e) {
      return truncateOutput(`Error editing file: ${(e as Error).message}`);
    }
  },
};

export const defaultTools: Tool[] = [readFile, writeFile, listDir, bash, editFile];

/**
 * Load custom tools from a directory.
 * Each .ts or .js file is imported, and all exported Tool objects are collected.
 * Set II_TOOLS_DIR env var to enable.
 */
export async function loadToolsFromDirectory(dirPath: string): Promise<Tool[]> {
  const { readdirSync } = await import("node:fs");
  const { join, extname } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  
  const tools: Tool[] = [];
  
  try {
    const files = readdirSync(dirPath);
    
    for (const file of files) {
      const ext = extname(file);
      if (ext !== ".ts" && ext !== ".js" && ext !== ".mjs") continue;
      
      const filePath = join(dirPath, file);
      const fileUrl = pathToFileURL(filePath).href;
      
      try {
        const module = await import(fileUrl);
        
        // Collect all exported values that look like Tools (have a name property)
        for (const exported of Object.values(module)) {
          if (exported && typeof exported === "object" && "name" in exported) {
            tools.push(exported as Tool);
          }
        }
      } catch (e) {
        console.error(`Warning: Failed to load tool from ${file}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    console.error(`Warning: Failed to read tools directory ${dirPath}: ${(e as Error).message}`);
  }
  
  return tools;
}
