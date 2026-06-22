// src/tools/index.ts

import type { Tool } from "./types.js";
import { bashTool } from "./bash.js";

export const ALL_TOOLS: Tool[] = [bashTool];

export function findTool(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function buildToolDefinitions(): Array<{
  name: string;
  description: string;
  input_schema: object;
}> {
  return ALL_TOOLS.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}
