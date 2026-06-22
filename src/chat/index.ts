// src/chat/index.ts

import * as readline from "node:readline";
import type { Agent } from "../agent/index.js";

/**
 * Chat：用户交互层。
 * 
 * 职责：显示提示、读取输入、打印回复。
 * 不做任何业务逻辑，只调用 agent.chat()。
 * 
 * 未来可替换：Web UI、Slack bot、API server，都不需要改 Agent。
 */
export class Chat {
  private agent: Agent;
  private rl: readline.Interface;
  private closed: boolean = false;

  constructor(agent: Agent) {
    this.agent = agent;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.rl.on("close", () => {
      this.closed = true;
    });
  }

  /**
   * 启动交互循环。
   */
  async start(): Promise<void> {
    console.log("=== Agent Ready ===");
    console.log("Type 'exit' to quit, 'clear' to reset history.\n");

    while (true) {
      const input = await this.ask("You: ");

      const command = input.trim().toLowerCase();

      if (command === "exit") {
        console.log("Goodbye.");
        break;
      }

      if (command === "clear") {
        this.agent.clear();
        console.log("History cleared.\n");
        continue;
      }

      const status = this.agent.getStatus();
      console.log(`[status: ${status.state}, messages: ${status.messageCount}]`);

      const response = await this.agent.chat(input);
      console.log(`Agent: ${response}\n`);
    }

    this.rl.close();
  }

  /**
   * 问一个问题，返回 Promise。
   */
  private ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      if (this.closed) {
        resolve("");
        return;
      }
      this.rl.question(question, (answer) => resolve(answer));
    });
  }
}