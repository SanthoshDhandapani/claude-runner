/**
 * tools.ts — defineTool() wrapper for creating custom in-process tools.
 *
 * Wraps the Agent SDK's tool() + createSdkMcpServer() into a simple API.
 */

import type { ToolDefinition, ToolResult } from "./types.js";

/**
 * Define a custom tool that runs in-process.
 *
 * @example
 * ```typescript
 * import { defineTool } from 'claude-runner';
 * import { z } from 'zod';
 *
 * const weather = defineTool(
 *   'get_weather',
 *   'Get current weather for a city',
 *   { city: z.string() },
 *   async ({ city }) => ({
 *     content: [{ type: 'text', text: `72°F in ${city}` }]
 *   })
 * );
 * ```
 */
export function defineTool<T extends Record<string, unknown>>(
  name: string,
  description: string,
  schema: T,
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
): ToolDefinition {
  // Store as a plain object — the Runner will wire it into createSdkMcpServer()
  return { __claudeRunnerTool: true, name, description, schema, handler };
}

/** Check if a value is a claude-runner tool definition. */
export function isRunnerTool(value: unknown): value is {
  __claudeRunnerTool: true;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "__claudeRunnerTool" in value &&
    (value as Record<string, unknown>).__claudeRunnerTool === true
  );
}
