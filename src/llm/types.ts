// src/llm/types.ts

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: object;
};

export interface LLMResponse {
  kind: "success";
  content: string;
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMError {
  kind: "error";
  message: string;
  isRetryable: boolean;
}

export type LLMResult = LLMResponse | LLMError;
