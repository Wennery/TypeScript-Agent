// src/llm/client.ts

import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config/index.js";
import type { Message, LLMResponse, LLMError, LLMResult, ToolDefinition } from "./types.js";

export class LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: Config) {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
      baseURL: config.anthropicBaseUrl,
    });
    this.model = config.anthropicModel;
    this.maxTokens = config.anthropicMaxTokens;
  }

  async complete(
    systemPrompt: string,
    messages: Message[],
    tools?: ToolDefinition[]
  ): Promise<LLMResult> {
    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: messages as Anthropic.Messages.MessageParam[],
        stream: true,
        ...(tools && tools.length > 0 ? { tools: tools as Anthropic.Messages.Tool[] } : {}),
      });

      let content = "";
      const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
      let stopReason = "unknown";
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        switch (event.type) {
          case "content_block_start":
            if (event.content_block.type === "text") {
              content += event.content_block.text;
            } else if (event.content_block.type === "tool_use") {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: "",
              };
            }
            break;
          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              content += event.delta.text;
            } else if (event.delta.type === "input_json_delta" && currentToolUse) {
              currentToolUse.inputJson += event.delta.partial_json;
            }
            break;
          case "content_block_stop":
            if (currentToolUse) {
              try {
                const input = JSON.parse(currentToolUse.inputJson || "{}");
                toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input });
              } catch {
                toolUses.push({ id: currentToolUse.id, name: currentToolUse.name, input: {} });
              }
              currentToolUse = null;
            }
            break;
          case "message_delta":
            stopReason = event.delta.stop_reason ?? "unknown";
            if (event.usage) {
              inputTokens = event.usage.input_tokens ?? 0;
              outputTokens = event.usage.output_tokens ?? 0;
            }
            break;
        }
      }

      const result: LLMResponse = {
        kind: "success",
        content,
        toolUses,
        stopReason,
        usage: { inputTokens, outputTokens },
      };

      return result;
    } catch (error) {
      let message = "Unknown error";
      let isRetryable = false;

      if (error instanceof Anthropic.APIError) {
        message = error.message;
        isRetryable = error.status === 429 || error.status >= 500;
      } else if (error instanceof Error) {
        message = error.message;
      }

      const err: LLMError = { kind: "error", message, isRetryable };
      return err;
    }
  }
}
