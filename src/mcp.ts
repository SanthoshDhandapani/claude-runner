/**
 * mcp.ts — MCP config normalization.
 *
 * Accepts shorthand strings and normalizes to Agent SDK McpServerConfig format.
 *   'npx @mcp/server arg1'       → { command: 'npx', args: ['@mcp/server', 'arg1'] }
 *   'https://api.example.com/mcp' → { type: 'http', url: '...' }
 *   { command: 'npx', args: [] }  → pass-through
 */

import type { McpConfig } from "./types.js";

type NormalizedMcp = Record<string, Record<string, unknown>>;

export function normalizeMcpConfig(
  input: Record<string, McpConfig>
): NormalizedMcp {
  const result: NormalizedMcp = {};

  for (const [name, config] of Object.entries(input)) {
    if (typeof config === "string") {
      if (
        config.startsWith("http://") ||
        config.startsWith("https://")
      ) {
        // URL → HTTP server
        result[name] = { type: "http", url: config };
      } else {
        // Command string → stdio server
        const parts = config.split(/\s+/);
        const [command, ...args] = parts;
        result[name] = { command: command!, args };
      }
    } else {
      // Object config — pass through
      result[name] = config as Record<string, unknown>;
    }
  }

  return result;
}

/** Build allowedTools wildcards for all MCP servers. */
export function buildMcpAllowedTools(
  serverNames: string[]
): string[] {
  return serverNames.map((name) => `mcp__${name}__*`);
}
