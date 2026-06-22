// src/config/index.ts

import "dotenv/config";

export interface Config {
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicMaxTokens: number;
  anthropicBaseUrl?: string;
}

export function loadConfig(): Config {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("ANTHROPIC_API_KEY required in .env");
  }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";
  const maxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "4096", 10);
  if (isNaN(maxTokens) || maxTokens <= 0) {
    throw new Error("ANTHROPIC_MAX_TOKENS must be positive number");
  }

  return {
    anthropicApiKey: apiKey,
    anthropicModel: model,
    anthropicMaxTokens: maxTokens,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
  };
}
