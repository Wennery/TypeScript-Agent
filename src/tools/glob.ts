import type { Tool } from "./types.js";
import { glob } from "node:fs/promises";

export const globTool: Tool = {
  name: "glob",
  description:
    "Search for files matching a glob pattern. " +
    "Use this to find files by name pattern, extension, or directory structure. " +
    "Supports patterns like `**/*.ts`, `src/**/*.ts`, `*.json`, etc. " +
    "Returns one file path per line.",
  input_schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description:
          "The glob pattern to match. " +
          "Use `**` for recursive directories, `*` for wildcards. " +
          "Example: `**/*.ts` finds all TypeScript files recursively.",
      },
    },
    required: ["pattern"],
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const pattern = args.pattern as string;

    try {
      const matches: string[] = [];
      for await (const entry of glob(pattern)) {
        matches.push(entry);
      }
      return matches.length > 0 ? matches.join("\n") : "(no matches)";
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
