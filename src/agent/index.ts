// src/agent/index.ts

import type { LLMClient } from "../llm/client.js";
import type { LLMResult } from "../llm/types.js";
import type { Message, ContentBlock } from "../llm/types.js";
import type { AgentConfig, AgentState, AgentStatus } from "./types.js";
import type { Tool } from "../tools/types.js";
import { findTool, buildToolDefinitions } from "../tools/index.js";

/**
 * Agent：核心对话循环。
 *
 * 职责：
 * - 维护对话历史
 * - 调用 LLM（带工具定义）
 * - 若 LLM 请求 tool_use → 权限检查 → 执行工具 → 把结果塞回 messages → 再次调用 LLM
 * - 若 LLM 返回纯文本 → 返回给用户
 *
 * 不做的：
 * - 不直接操作文件/网络（通过 Tools 注入）
 * - 不处理用户输入输出（Chat 层负责）
 * - 不重试（可在外层包装）
 */
export class Agent {
  private client: LLMClient;
  private systemPrompt: string;
  private messages: Message[];
  private state: AgentState;
  private tools: Tool[];
  private pipeline?;

  constructor(client: LLMClient, config: AgentConfig) {
    this.client = client;
    this.systemPrompt = config.systemPrompt;
    this.messages = [];
    this.state = "idle";
    this.tools = config.tools || [];
    this.pipeline = config.pipeline;
  }

  /**
   * 核心循环：接收用户输入，返回助手回复。
   *
   * 流程（Agent Loop）：
   *   1. 追加用户消息到历史
   *   2. 进入 loop：调用 LLM（传入 tools 定义）
   *   3. 若 LLM 返回错误 → 退出 loop，返回错误
   *   4. 若 LLM 没有 tool_use → 退出 loop，返回文本
   *   5. 若 LLM 有 tool_use → 每个工具：权限检查 → 执行 → 把结果塞回 messages → 回到步骤 2
   */
  async chat(userInput: string): Promise<string> {
    this.state = "thinking";

    // Step 1: 记录用户输入
    this.messages.push({ role: "user", content: userInput });

    // Step 2: Agent Loop
    let turn = 0;
    const maxTurns = 10;

    while (turn < maxTurns) {
      turn++;

      const toolDefs = buildToolDefinitions();

      const result: LLMResult = await this.client.complete(
        this.systemPrompt,
        this.messages,
        toolDefs.length > 0 ? toolDefs : undefined
      );

      // 处理错误
      if (result.kind === "error") {
        this.state = "idle";
        return `[Error] ${result.message}`;
      }

      // 记录 LLM 的 assistant 消息（文本 + 可能的 tool_use blocks）
      const assistantBlocks: ContentBlock[] = [];
      if (result.content) {
        assistantBlocks.push({ type: "text", text: result.content });
      }
      for (const tu of result.toolUses) {
        assistantBlocks.push({
          type: "tool_use",
          id: tu.id,
          name: tu.name,
          input: tu.input,
        });
      }
      this.messages.push({ role: "assistant", content: assistantBlocks });

      // 如果没有 tool_use，LLM 直接回答完毕，返回给用户
      if (result.toolUses.length === 0) {
        this.state = "idle";
        return result.content;
      }

      // 有 tool_use，执行每个工具
      const toolResultBlocks: ContentBlock[] = [];
      for (const tu of result.toolUses) {
        const tool = findTool(tu.name);
        if (!tool) {
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: Tool "${tu.name}" not found`,
            is_error: true,
          });
          continue;
        }

        // 权限检查 — 三闸流水线
        const permResult = await this.pipeline?.check(tu.name, tu.input);
        if (permResult && permResult.action === "deny") {
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `${permResult.reason}`,
            is_error: true,
          });
          continue;
        }

        console.log(`[Tool] ${tool.name} ${JSON.stringify(tu.input)}`);

        try {
          const output = await tool.execute(tu.input);
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: output,
          });
        } catch (err) {
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }

      // 把工具结果塞回 messages，继续 loop
      this.messages.push({ role: "user", content: toolResultBlocks });
    }

    this.state = "idle";
    return "[Error] Max tool turns exceeded";
  }

  getStatus(): AgentStatus {
    return {
      state: this.state,
      messageCount: this.messages.length,
    };
  }

  getHistory(): readonly Message[] {
    return this.messages;
  }

  clear(): void {
    this.messages = [];
  }
}
