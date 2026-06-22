// src/agent/types.ts

import type { Message } from "../llm/types.js";
import type { Tool } from "../tools/types.js";

export interface AgentConfig {
  systemPrompt: string;
  tools?: Tool[];
}

export type AgentState = "idle" | "thinking";

export interface AgentStatus {
  state: AgentState;
  messageCount: number;
}
