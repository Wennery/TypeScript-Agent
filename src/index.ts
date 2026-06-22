// src/index.ts

import { loadConfig } from "./config/index.js";
import { LLMClient } from "./llm/client.js";
import { Agent } from "./agent/index.js";
import { Chat } from "./chat/index.js";
import { ALL_TOOLS } from "./tools/index.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new LLMClient(config);

  const agent = new Agent(client, {
    systemPrompt:
      "You are a helpful coding assistant. " +
      "You have access to a bash tool that can execute shell commands. " +
      "Use it when needed to help the user. Answer concisely.",
    tools: ALL_TOOLS,
  });

  const chat = new Chat(agent);
  await chat.start();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
