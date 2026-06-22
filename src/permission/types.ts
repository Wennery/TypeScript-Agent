// src/permission/types.ts

import { resolve } from "node:path";

/**
 * Gate 1: Deny list — always block, no user override.
 * For extremely dangerous operations (system destruction).
 */
export interface DenyRule {
  name: string;
  description: string;
  /** Which tools this rule applies to (e.g. ["bash"]) */
  tools: string[];
  /**
   * Check if the call matches. Return a reason string to block,
   * or null to skip.
   */
  match: (args: Record<string, unknown>, workdir: string) => string | null;
}

/**
 * Gate 2: Context rule — matched items need user approval.
 * For operations that might be safe or risky depending on context
 * (e.g. writing outside workspace, deleting files).
 */
export interface ContextRule {
  name: string;
  description: string;
  tools: string[];
  match: (args: Record<string, unknown>, workdir: string) => string | null;
}

/** Final result after the full pipeline (allow or deny only). */
export interface PermissionResult {
  action: "allow" | "deny";
  reason?: string;
  rule?: string;
}

/** Callback provided by Chat layer to ask the user. */
export type ApprovalHandler = (
  toolName: string,
  args: Record<string, unknown>,
  reason: string
) => Promise<boolean>;

/**
 * Resolve a path relative to workdir, then check if it stays inside workdir.
 * Returns the reason string if outside, or null if inside.
 */
export function checkPathScope(
  path: string,
  workdir: string,
  label: string
): string | null {
  const resolved = resolve(workdir, path);
  if (!resolved.startsWith(workdir)) {
    return `${label}: ${path} (outside workspace)`;
  }
  return null;
}
