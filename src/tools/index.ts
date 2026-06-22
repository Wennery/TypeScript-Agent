// src/tools/index.ts

import type { Tool } from "./types.js";
import { bashTool } from "./bash.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { globTool } from "./glob.js";

export const ALL_TOOLS: Tool[] = [bashTool, readTool, writeTool, globTool];

export function findTool(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function buildToolDefinitions() {
  return ALL_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}
