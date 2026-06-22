// src/tools/read.ts

import type { Tool } from "./types.js";
import { readFile } from "node:fs/promises";

export const readTool: Tool = {
  name: "read",
  description:
    "Read the contents of a file at the given path. " +
    "Use this to view source code, configuration files, logs, text files, etc. " +
    "The content is returned as text. File must exist.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute or relative path to the file to read",
      },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const path = args.path as string;

    try {
      const content = await readFile(path, "utf-8");
      return content;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
