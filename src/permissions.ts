/**
 * permissions.ts — Permission policy → Agent SDK canUseTool adapter.
 *
 * Translates our simple permission model into the SDK's canUseTool callback.
 */

import type { PermissionPolicy, PermissionRequest } from "./types.js";

type PermissionResult =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

interface CanUseToolOpts {
  toolUseID: string;
  title?: string;
  description?: string;
}

/** Match a tool name against a pattern (supports * wildcards). */
function matchPattern(pattern: string, toolName: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    return toolName.startsWith(pattern.slice(0, -1));
  }
  return pattern === toolName;
}

function matchesAny(patterns: string[], toolName: string): boolean {
  return patterns.some((p) => matchPattern(p, toolName));
}

/** Build canUseTool callback from permission config. */
export function buildCanUseTool(
  permissions: "auto" | "prompt" | "deny-unknown" | PermissionPolicy,
  onPermission?: (request: PermissionRequest) => Promise<boolean>
): (
  toolName: string,
  input: Record<string, unknown>,
  opts: CanUseToolOpts
) => Promise<PermissionResult> {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    opts: CanUseToolOpts
  ): Promise<PermissionResult> => {
    const allow = (): PermissionResult => ({
      behavior: "allow",
      updatedInput: input,
    });
    const deny = (msg: string): PermissionResult => ({
      behavior: "deny",
      message: msg,
    });

    // Auto mode: allow everything
    if (permissions === "auto") return allow();

    // Deny-unknown: allow safe tools, deny rest
    if (permissions === "deny-unknown") {
      const safe = [
        "Read", "Glob", "Grep", "Agent", "Skill", "ToolSearch",
        "Write", "Edit",
      ];
      if (safe.includes(toolName) || toolName.startsWith("mcp__")) {
        return allow();
      }
      return deny(`Tool ${toolName} not in safe list`);
    }

    // Prompt mode: route through callback
    if (permissions === "prompt") {
      if (!onPermission) return allow();
      const allowed = await onPermission({
        tool: toolName,
        id: opts.toolUseID,
        description: opts.description ?? toolName,
        input,
      });
      return allowed ? allow() : deny("User denied");
    }

    // Policy object
    const policy = permissions as PermissionPolicy;
    if (policy.deny && matchesAny(policy.deny, toolName)) {
      return deny(`Tool ${toolName} is denied by policy`);
    }
    if (policy.allow && matchesAny(policy.allow, toolName)) {
      return allow();
    }
    if (policy.prompt && matchesAny(policy.prompt, toolName) && onPermission) {
      const allowed = await onPermission({
        tool: toolName,
        id: opts.toolUseID,
        description: opts.description ?? toolName,
        input,
      });
      return allowed ? allow() : deny("User denied");
    }
    // Default: deny unknown
    return deny(`Tool ${toolName} not covered by permission policy`);
  };
}
