// src/permission/context-rules.ts
//
// Gate 2: Context rules — matched items need user approval.
// These check scope, safety, and potential impact.

import type { ContextRule } from "./types.js";
import { checkPathScope } from "./types.js";

/**
 * Writing files outside the workspace needs approval.
 * For example: ~/.ssh/config, /etc/hosts, /usr/local/bin/...
 */
export const WRITE_OUTSIDE_WORKSPACE: ContextRule = {
  name: "write-outside-workspace",
  description: "Writing to a location outside the project directory",
  tools: ["write"],
  match: (args, workdir) => {
    const path = (args.path as string) || "";
    return checkPathScope(path, workdir, "Writing outside workspace");
  },
};

/**
 * Reading files outside the workspace needs approval.
 * For example: /etc/passwd, ~/.ssh/id_rsa, ../secrets/...
 */
export const READ_OUTSIDE_WORKSPACE: ContextRule = {
  name: "read-outside-workspace",
  description: "Reading a file outside the project directory",
  tools: ["read"],
  match: (args, workdir) => {
    const path = (args.path as string) || "";
    return checkPathScope(path, workdir, "Reading outside workspace");
  },
};

/**
 * Glob patterns that escape the workspace need approval.
 */
export const GLOB_OUTSIDE_WORKSPACE: ContextRule = {
  name: "glob-outside-workspace",
  description: "Searching for files outside the project directory",
  tools: ["glob"],
  match: (args, workdir) => {
    const pattern = (args.pattern as string) || "";
    // Patterns starting with / or containing ../ can escape the workspace
    if (pattern.startsWith("/") || pattern.includes("..")) {
      return `Glob pattern may escape workspace: ${pattern}`;
    }
    return null;
  },
};

/**
 * Bash commands with delete or destructive keywords need approval.
 * This catches `rm file` (single file delete) but not `rm -rf /` (that's Gate 1).
 */
export const DESTRUCTIVE_BASH: ContextRule = {
  name: "destructive-bash",
  description: "Command may delete or modify files",
  tools: ["bash"],
  match: (args) => {
    const cmd = (args.command as string) || "";
    const keywords = [
      "rm ", "mv ", "> /etc/", "chmod ", "chown ",
      "dd ", "truncate ", "> /dev/",
    ];
    for (const kw of keywords) {
      if (cmd.includes(kw)) return `Potentially destructive command: contains "${kw.trim()}"`;
    }
    return null;
  },
};

/**
 * Installing packages needs approval — they execute arbitrary code.
 */
export const INSTALL_PACKAGES: ContextRule = {
  name: "install-packages",
  description: "Installing or updating packages",
  tools: ["bash"],
  match: (args) => {
    const cmd = (args.command as string) || "";
    const installers = [
      /^npm\s+(install|add|ci)\b/,
      /^pip\s+install\b/,
      /^yarn\s+(add|install)\b/,
      /^pnpm\s+(add|install)\b/,
      /^brew\s+install\b/,
      /^cargo\s+install\b/,
    ];
    for (const p of installers) {
      if (p.test(cmd.trim())) {
        return `Installing packages: ${cmd.trim().split(/\s+/).slice(0, 3).join(" ")}...`;
      }
    }
    return null;
  },
};

/** All built-in context rules. */
export const CONTEXT_RULES: ContextRule[] = [
  WRITE_OUTSIDE_WORKSPACE,
  READ_OUTSIDE_WORKSPACE,
  GLOB_OUTSIDE_WORKSPACE,
  DESTRUCTIVE_BASH,
  INSTALL_PACKAGES,
];
