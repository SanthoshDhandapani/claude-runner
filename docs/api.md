# API Reference

## Runner

```typescript
class Runner {
  constructor(options?: RunnerOptions);

  run(prompt: string, overrides?: RunOverrides): Promise<RunResult>;
  stream(prompt: string, overrides?: RunOverrides): RunStream;
  resume(sessionId: string, prompt?: string): RunStream;

  get lastSessionId(): string | null;
  abort(): void;
}
```

### `run(prompt, overrides?)`

Run a prompt to completion. Returns the final result.

### `stream(prompt, overrides?)`

Start streaming. Returns a `RunStream` (async iterable of `RunEvent`).

### `resume(sessionId, prompt?)`

Resume a previous session. Returns a `RunStream`.

### `lastSessionId`

Session ID from the last completed run. Read-only.

### `abort()`

Kill any active query. Cleans up resources.

---

## RunStream

```typescript
interface RunStream extends AsyncIterable<RunEvent> {
  result: Promise<RunResult>;
  text: Promise<string>;
  sessionId: string | null;

  send(message: string): void;
  interrupt(): Promise<void>;
  abort(): void;
}
```

---

## RunResult

```typescript
interface RunResult {
  text: string;
  sessionId: string;
  cost: number;                            // USD
  duration: number;                        // ms
  usage: { input: number; output: number };
  turns: number;
  toolCalls: ToolCallSummary[];
  error?: string;
  structured?: unknown;
}
```

---

## RunEvent

| Type | Fields | When |
|---|---|---|
| `text` | `text` | Each streamed text chunk |
| `tool_start` | `tool`, `id`, `input?` | Tool execution begins |
| `tool_end` | `tool`, `id`, `duration` | Tool execution ends |
| `task_start` | `taskId`, `description` | Subagent task begins |
| `task_progress` | `taskId`, `description`, `toolName?`, `summary?`, `usage?` | Subagent progress |
| `task_done` | `taskId`, `status`, `summary`, `usage?` | Subagent task ends |
| `session_init` | `sessionId`, `model`, `tools` | Session initialized |
| `mcp_status` | `server`, `status` | MCP server connected/failed |
| `error` | `message`, `code?` | Error occurred |
| `done` | `result` | Run complete |

---

## RunnerOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | `'claude-sonnet-4-6'` | Model (shorthands: `opus`, `sonnet`, `haiku`) |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `systemPrompt` | `string \| { preset: 'claude_code'; append?: string }` | minimal | System prompt |
| `mcp` | `Record<string, McpConfig \| string>` | `{}` | MCP servers |
| `tools` | `ToolDefinition[]` | `[]` | Custom in-process tools |
| `agents` | `Record<string, AgentDefinition>` | — | Subagent definitions |
| `sandbox` | `'local' \| 'e2b' \| 'docker' \| SpawnFn` | `'local'` | Execution environment |
| `e2b` | `E2bConfig` | — | E2B config (when sandbox: 'e2b') |
| `docker` | `DockerConfig` | — | Docker config (when sandbox: 'docker') |
| `permissions` | `'auto' \| 'prompt' \| 'deny-unknown' \| PermissionPolicy` | `'deny-unknown'` | Permission handling |
| `onPermission` | `(req: PermissionRequest) => Promise<boolean>` | — | Permission callback |
| `maxTurns` | `number` | — | Max agentic turns |
| `maxBudget` | `number` | — | Max cost in USD |
| `effort` | `'low' \| 'medium' \| 'high' \| 'max'` | — | Effort level |
| `hooks` | `RunnerHookDeclarations` | — | Declarative hook rules |
| `settingSources` | `('user' \| 'project' \| 'local')[]` | `[]` | Filesystem settings to load |
| `sdkOptions` | `object` | — | Pass-through to Agent SDK |

---

## RunOverrides

Per-run overrides (merged with constructor options):

```typescript
interface RunOverrides {
  model?: string;
  systemPrompt?: string;
  outputFormat?: { type: 'json_schema'; schema: object };
  mcp?: Record<string, McpConfig>;
  signal?: AbortSignal;
}
```

---

## McpConfig

```typescript
type McpConfig =
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string> }
  | string;  // shorthand: 'npx @mcp/server' or 'https://example.com/mcp'
```

---

## DockerConfig

```typescript
interface DockerConfig {
  image?: string;       // default: 'node:22-slim'
  mount?: string[];     // additional read-only bind mounts
  network?: string;     // Docker network mode
}
```

---

## PermissionRequest

```typescript
interface PermissionRequest {
  tool: string;
  id: string;
  description: string;
  input?: Record<string, unknown>;
}
```

---

## PermissionPolicy

```typescript
interface PermissionPolicy {
  allow?: string[];     // patterns to always allow
  deny?: string[];      // patterns to always deny
  prompt?: string[];    // patterns routed to onPermission callback
}
```

---

## Hooks

```typescript
type RunnerHookDeclarations = Partial<Record<string, RunnerHookMatcher[]>>;

interface RunnerHookMatcher {
  matcher?: string;
  timeout?: number;
  rules?: HookRule[];
  module?: string;
  config?: Record<string, unknown>;
  callbacks?: Array<(input, id, opts) => Promise<Record<string, unknown>>>;
}

interface HookRule {
  deny?: string;
  allow?: string;
  context?: string;
  reason?: string;
}
```

---

## SpawnFn (custom sandbox)

```typescript
type SpawnFn = (options: SpawnOptions) => SpawnedProcess;

interface SpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
}

interface SpawnedProcess {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  killed: boolean;
  exitCode: number | null;
  kill(signal?: string): boolean;
  on(event: 'exit' | 'error', listener: (...args: unknown[]) => void): void;
}
```

---

## Standalone functions

### `defineTool(name, description, schema, handler)`

Create a custom in-process tool:

```typescript
import { defineTool } from 'claude-runner';
import { z } from 'zod';

const tool = defineTool(
  'get_weather',
  'Get weather for a city',
  { city: z.string() },
  async ({ city }) => ({
    content: [{ type: 'text', text: `72°F in ${city}` }],
  })
);
```

### `resolveModel(shorthand?)`

Resolve a model shorthand to a full model ID:

```typescript
import { resolveModel } from 'claude-runner';

resolveModel('opus');      // 'claude-opus-4-6'
resolveModel('sonnet');    // 'claude-sonnet-4-6'
resolveModel('haiku');     // 'claude-haiku-4-5-20251001'
```

### `getDockerStatus()`

Check if Docker is available:

```typescript
import { getDockerStatus } from 'claude-runner';

const version = getDockerStatus(); // '29.1.3' or null
```

---

## Model shorthands

| Shorthand | Full Model ID |
|---|---|
| `opus` | `claude-opus-4-6` |
| `opus-4.6` | `claude-opus-4-6` |
| `opus-4.5` | `claude-opus-4-5-20250918` |
| `sonnet` | `claude-sonnet-4-6` |
| `sonnet-4.6` | `claude-sonnet-4-6` |
| `sonnet-4.5` | `claude-sonnet-4-5-20250514` |
| `haiku` | `claude-haiku-4-5-20251001` |
| `haiku-4.5` | `claude-haiku-4-5-20251001` |
