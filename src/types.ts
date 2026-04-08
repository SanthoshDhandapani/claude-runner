/**
 * types.ts — All public types for claude-runner.
 *
 * Flat, simple, developer-friendly. The Agent SDK has 40+ options and 20+ message types.
 * We expose 7 event types and a clean options interface.
 */

// Re-export SDK types that advanced users may need
export type {
  AgentDefinition,
  McpServerConfig as SdkMcpServerConfig,
  Options as AgentSdkOptions,
} from "@anthropic-ai/claude-agent-sdk";

// ─── MCP ───────────────────────────────────────────────────────────────────

/** MCP server config — full object or shorthand string. */
export type McpConfig =
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { type: "http" | "sse"; url: string; headers?: Record<string, string> }
  | string; // shorthand: 'npx @mcp/server arg1 arg2' or 'https://api.example.com/mcp'

// ─── Permissions ───────────────────────────────────────────────────────────

export interface PermissionRequest {
  tool: string;
  id: string;
  description: string;
  input?: Record<string, unknown>;
}

export interface PermissionPolicy {
  /** Tools to always allow (supports wildcards: 'mcp__github__*'). */
  allow?: string[];
  /** Tools to always deny. */
  deny?: string[];
  /** Tools that go through onPermission callback. */
  prompt?: string[];
}

// ─── Sandbox ───────────────────────────────────────────────────────────────

export interface SpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
}

export interface SpawnedProcess {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  killed: boolean;
  exitCode: number | null;
  kill(signal?: string): boolean;
  on(event: "exit" | "error", listener: (...args: unknown[]) => void): void;
}

export type SpawnFn = (options: SpawnOptions) => SpawnedProcess;

export interface E2bConfig {
  apiKey?: string;
  template?: string;
  timeout?: number;
}

export interface DockerConfig {
  image?: string;
  mount?: string[];
  network?: string;
}

// ─── Tools ─────────────────────────────────────────────────────────────────

export interface ToolResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
}

// Use `any` for the tool definition since the SDK's type is complex and generic
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolDefinition = any;

// ─── Runner Options ────────────────────────────────────────────────────────

export interface RunnerOptions {
  /** Model to use. Default: 'claude-sonnet-4-6'. */
  model?: string;
  /** Working directory. Default: process.cwd(). */
  cwd?: string;
  /** System prompt. Default: minimal prompt (not Claude Code's). */
  systemPrompt?: string | { preset: "claude_code"; append?: string };
  /** MCP server configurations. Shorthand strings supported. */
  mcp?: Record<string, McpConfig>;
  /** Custom tools that run in-process. */
  tools?: ToolDefinition[];
  /** Programmatic subagent definitions. */
  agents?: Record<string, import("@anthropic-ai/claude-agent-sdk").AgentDefinition>;

  /** Sandbox isolation. Default: 'local' (bare metal). */
  sandbox?: "local" | "e2b" | "docker" | SpawnFn;
  /** E2B config (only when sandbox: 'e2b'). */
  e2b?: E2bConfig;
  /** Docker config (only when sandbox: 'docker'). */
  docker?: DockerConfig;

  /** Permission handling. Default: 'deny-unknown'. */
  permissions?: "auto" | "prompt" | "deny-unknown" | PermissionPolicy;
  /** Permission callback (when permissions: 'prompt' or PermissionPolicy with prompt list). */
  onPermission?: (request: PermissionRequest) => Promise<boolean>;

  /** Max agentic turns. */
  maxTurns?: number;
  /** Max budget in USD. */
  maxBudget?: number;
  /** Effort level. */
  effort?: "low" | "medium" | "high" | "max";
  /** Which filesystem settings to load. Default: [] (none). */
  settingSources?: ("user" | "project" | "local")[];
  /** Pass-through to Agent SDK Options for anything not covered. */
  sdkOptions?: Record<string, unknown>;
}

// ─── Run Result ────────────────────────────────────────────────────────────

export interface ToolCallSummary {
  tool: string;
  id: string;
  duration: number;
}

export interface RunResult {
  /** Final text output. */
  text: string;
  /** Session ID for resumption. */
  sessionId: string;
  /** Cost in USD. */
  cost: number;
  /** Duration in ms. */
  duration: number;
  /** Token usage. */
  usage: { input: number; output: number };
  /** Number of agentic turns. */
  turns: number;
  /** Tool calls made. */
  toolCalls: ToolCallSummary[];
  /** Error message if run failed. */
  error?: string;
  /** Structured output (if outputFormat was set). */
  structured?: unknown;
}

// ─── Run Events (Streaming) ────────────────────────────────────────────────

export type RunEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; tool: string; id: string; input?: Record<string, unknown> }
  | { type: "tool_end"; tool: string; id: string; duration: number }
  | { type: "session_init"; sessionId: string; model: string; tools: string[] }
  | { type: "mcp_status"; server: string; status: "connected" | "failed" | "needs-auth" }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; result: RunResult };

// ─── Run Overrides (per-run) ───────────────────────────────────────────────

export interface RunOverrides {
  model?: string;
  systemPrompt?: string;
  outputFormat?: { type: "json_schema"; schema: object };
  mcp?: Record<string, McpConfig>;
  signal?: AbortSignal;
}
