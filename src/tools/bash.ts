// src/tools/bash.ts

import type { Tool } from "./types.js";

export const bashTool: Tool = {
  name: "bash",
  description:
    "Execute a shell command in a working directory. " +
    "Use this to run commands like `ls`, `cat`, `grep`, `pwd`, etc. " +
    "Returns the command output as text.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
    },
    required: ["command"],
  },
  execute: async (args: Record<string, unknown>) => {
    const { exec } = await import("node:child_process");
    const command = args.command as string;
    return new Promise((resolve) => {
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          resolve(`Error: ${error.message}\nstderr: ${stderr}`);
        } else {
          resolve(stdout || stderr || "(no output)");
        }
      });
    });
  },
};
