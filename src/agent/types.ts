// src/agent/types.ts

import type { Message } from "../llm/types.js";
import type { Tool } from "../tools/types.js";
import type { PermissionPipeline } from "../permission/index.js";

export interface AgentConfig {
  systemPrompt: string;
  tools?: Tool[];
  pipeline?: PermissionPipeline;
}

export type AgentState = "idle" | "thinking";

export interface AgentStatus {
  state: AgentState;
  messageCount: number;
}
