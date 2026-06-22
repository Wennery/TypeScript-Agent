// src/permission/pipeline.ts
//
// Three-gate permission pipeline:
//
//   Gate 1: Deny list   → always block (no override)
//   Gate 2: Context     → ask user for approval
//   Gate 3: User input  → called via ApprovalHandler
//
// If no gate blocks → allow.

import type { DenyRule, ContextRule, PermissionResult, ApprovalHandler } from "./types.js";

export class PermissionPipeline {
  constructor(
    private readonly workdir: string,
    private readonly denyRules: DenyRule[],
    private readonly contextRules: ContextRule[],
    private onAsk?: ApprovalHandler,
  ) {}

  /** Register the approval handler (called after Chat is created). */
  setApprovalHandler(handler: ApprovalHandler): void {
    this.onAsk = handler;
  }

  /**
   * Run the full pipeline. Returns only "allow" or "deny".
   *
   * - Gate 1: deny list match → immediate deny
   * - Gate 2: context rule match → Gate 3: ask user → allow/deny
   * - No match → allow
   */
  async check(toolName: string, args: Record<string, unknown>): Promise<PermissionResult> {
    // Gate 1: Deny list — always block, no user override
    for (const rule of this.denyRules) {
      if (!rule.tools.includes(toolName)) continue;
      const reason = rule.match(args, this.workdir);
      if (reason !== null) {
        return { action: "deny", reason, rule: rule.name };
      }
    }

    // Gate 2: Context rules — matched items go to user approval
    for (const rule of this.contextRules) {
      if (!rule.tools.includes(toolName)) continue;
      const reason = rule.match(args, this.workdir);
      if (reason !== null) {
        // Gate 3: Ask the user
        if (this.onAsk) {
          const approved = await this.onAsk(toolName, args, reason);
          if (!approved) {
            return { action: "deny", reason: `User denied: ${reason}`, rule: rule.name };
          }
          // approved → proceed (don't break, continue checking remaining rules? or return allow?)
          // Actually: if user approved one rule, we should stop checking and allow.
          // Because the rule says "this needs approval", user said yes → allow.
          return { action: "allow" };
        }
        // No handler registered — fail safe: deny
        return { action: "deny", reason: `No approval handler: ${reason}`, rule: rule.name };
      }
    }

    return { action: "allow" };
  }
}
