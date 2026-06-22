// src/tools/write.ts

import type { Tool } from "./types.js";
import { writeFile } from "node:fs/promises";

export const writeTool: Tool = {
  name: "write",
  description:
    "Write content to a file at the given path. " +
    "Creates the file if it doesn't exist, overwrites if it does. " +
    "Use this to create new files, modify code, save outputs, etc. " +
    "Returns a confirmation with the byte count.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The absolute or relative path to the file to write",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["path", "content"],
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const path = args.path as string;
    const content = args.content as string;

    try {
      await writeFile(path, content, "utf-8");
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
