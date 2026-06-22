// src/permission/deny-list.ts
//
// Gate 1: Deny list — always block, no user override.
// These are operations that should never be allowed.

import type { DenyRule } from "./types.js";

/**
 * Commands that can destroy the operating system or hardware.
 * These always match — no matter the workdir.
 */
export const DESTRUCTIVE_SYSTEM_COMMANDS: DenyRule = {
  name: "destructive-system-commands",
  description: "Never allow commands that can destroy the OS or hardware",
  tools: ["bash"],
  match: (args) => {
    const cmd = (args.command as string) || "";
    const patterns = [
      /^rm\s+-rf\s+\/$/,
      /^rm\s+-rf\s+\/\*$/,
      /^dd\s+if=.*of=\/dev\//,
      /^mkfs\./,
      /^fdisk\s+\/dev\//,
      /^chmod\s+-R\s+0\s+\//,
    ];
    for (const p of patterns) {
      if (p.test(cmd.trim())) {
        return `Blocked by "destructive-system-commands": ` +
          `Never allow commands that can destroy the OS or hardware`;
      }
    }
    return null;
  },
};

export const DENY_LIST: DenyRule[] = [DESTRUCTIVE_SYSTEM_COMMANDS];
