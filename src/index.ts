/**
 * claude-runner — The easiest way to build AI agents with Claude.
 *
 * @example
 * ```typescript
 * import { Runner } from 'claude-runner';
 *
 * const runner = new Runner();
 * const result = await runner.run('Analyze this codebase');
 * console.log(result.text);
 * ```
 *
 * @example Streaming
 * ```typescript
 * for await (const event of runner.stream('Fix the tests')) {
 *   if (event.type === 'text') process.stdout.write(event.text);
 * }
 * ```
 *
 * @example MCP + Sandbox
 * ```typescript
 * const runner = new Runner({
 *   mcp: { github: 'npx @modelcontextprotocol/server-github' },
 *   sandbox: 'e2b',
 *   permissions: 'auto',
 * });
 * ```
 */

// Core
export { Runner } from "./runner.js";
export { RunStream } from "./stream.js";

// Tools
export { defineTool } from "./tools.js";

// Models
export { resolveModel } from "./models.js";

// Sandbox
export { getDockerStatus } from "./sandbox/index.js";

// Types
export type {
  RunnerOptions,
  RunResult,
  RunEvent,
  RunOverrides,
  McpConfig,
  PermissionRequest,
  PermissionPolicy,
  RunnerHookDeclarations,
  RunnerHookMatcher,
  HookRule,
  ToolCallSummary,
  ToolDefinition,
  ToolResult,
  SpawnFn,
  SpawnOptions,
  SpawnedProcess,
  E2bConfig,
  DockerConfig,
} from "./types.js";

// Re-exports from Agent SDK for advanced users
export type {
  AgentDefinition,
  AgentSdkOptions,
} from "./types.js";
