// src/index.ts

import { loadConfig } from "./config/index.js";
import { LLMClient } from "./llm/client.js";
import { Agent } from "./agent/index.js";
import { Chat } from "./chat/index.js";
import { ALL_TOOLS } from "./tools/index.js";
import { PermissionPipeline, DENY_LIST, CONTEXT_RULES } from "./permission/index.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new LLMClient(config);

  // 权限三闸流水线 — 以项目目录为工作区
  const workdir = process.cwd();
  const pipeline = new PermissionPipeline(workdir, DENY_LIST, CONTEXT_RULES);

  const agent = new Agent(client, {
    systemPrompt:
      "You are a helpful assistant. " +
      "You have tools available — use them when needed. Answer concisely.",
    tools: ALL_TOOLS,
    pipeline,
  });

  const chat = new Chat(agent);

  // 把 Chat 的 ask 回调注入 pipeline（解决循环引用）
  pipeline.setApprovalHandler((toolName, args, reason) =>
    chat.askPermission(toolName, args, reason)
  );

  await chat.start();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
