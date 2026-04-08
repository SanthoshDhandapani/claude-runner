# claude-runner

[![npm version](https://img.shields.io/npm/v/claude-runner.svg)](https://www.npmjs.com/package/claude-runner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

**The easiest way to build AI agents with Claude.** MCP-native, sandbox-ready, 5 lines to start.

Built on the official [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview). One dependency. Zero bloat.

```typescript
import { Runner } from 'claude-runner';

const runner = new Runner();
const result = await runner.run('Analyze this codebase and suggest improvements');
console.log(result.text);
```

## Why claude-runner?

The official `@anthropic-ai/claude-agent-sdk` is powerful but low-level — 40+ options, 20+ message types, raw async generators. Every developer builds their own wrapper.

**claude-runner** is that wrapper:

| | raw Agent SDK | **claude-runner** |
|---|---|---|
| Lines to start | 20+ | **5** |
| Message types | 20+ nested | **7 flat events** |
| MCP config | Object only | **Shorthand strings** |
| Sandbox | Manual `spawnClaudeCodeProcess` | **`sandbox: 'e2b'`** |
| Session resume | `resume: id` option | **`runner.resume(id)`** |
| Permissions | `canUseTool` callback | **`permissions: 'auto'`** |
| Custom tools | `tool()` + `createSdkMcpServer()` | **`defineTool()`** |

## Install

```bash
npm install claude-runner
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/getting-started) to be installed and authenticated.

## Quick Start

### Simple await

```typescript
import { Runner } from 'claude-runner';

const runner = new Runner();
const result = await runner.run('Fix the failing tests in this project');

console.log(result.text);           // Claude's response
console.log(`Cost: $${result.cost}`); // API cost
console.log(`Turns: ${result.turns}`); // Agentic turns
```

### Streaming

```typescript
for await (const event of runner.stream('Refactor the auth module')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.text);
      break;
    case 'tool_start':
      console.log(`\n[${event.tool}]`);
      break;
    case 'tool_end':
      console.log(`[${event.tool}] done (${event.duration}ms)`);
      break;
    case 'done':
      console.log(`\nCost: $${event.result.cost.toFixed(4)}`);
      break;
  }
}
```

### Session Resume

```typescript
// First run — Claude analyzes and asks for approval
const r1 = await runner.run('Create a test plan for the auth module');
console.log(r1.text); // "Here's the plan... approve?"

// Resume — continue the conversation with full context
const r2 = await runner.resume(r1.sessionId, 'Approved. Generate the tests.').result;
console.log(r2.text); // "Tests generated at..."
```

### Multi-turn (mid-stream messages)

```typescript
const stream = runner.stream('Build a REST API for user management');

// Inject guidance while Claude is working
setTimeout(() => stream.send('Use Express, not Fastify'), 5000);

for await (const event of stream) {
  if (event.type === 'text') process.stdout.write(event.text);
}
```

## MCP Servers

Connect to any [MCP server](https://github.com/modelcontextprotocol/servers) with shorthand strings or full config objects.

```typescript
const runner = new Runner({
  mcp: {
    // Command string (auto-parsed)
    github: 'npx @modelcontextprotocol/server-github',

    // URL (HTTP/SSE server)
    docs: 'https://api.example.com/mcp',

    // Full config
    postgres: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-postgres', process.env.DATABASE_URL!],
      env: { PGPASSWORD: process.env.PGPASSWORD! },
    },
  },
});

const result = await runner.run('How many users signed up last week?');
```

All MCP tools are auto-discovered and auto-allowed. Claude sees them and can use them immediately.

## Custom Tools

Define tools that run in your process:

```typescript
import { Runner, defineTool } from 'claude-runner';
import { z } from 'zod';

const weather = defineTool(
  'get_weather',
  'Get current weather for a city',
  { city: z.string() },
  async ({ city }) => ({
    content: [{ type: 'text', text: `72°F and sunny in ${city}` }],
  })
);

const runner = new Runner({ tools: [weather] });
const result = await runner.run('What is the weather in San Francisco?');
```

## Permissions

Control what Claude can do:

```typescript
// Auto-approve everything (for CI, sandboxed environments)
const runner = new Runner({ permissions: 'auto' });

// Deny unknown tools (safe default)
const runner = new Runner({ permissions: 'deny-unknown' });

// Interactive approval
const runner = new Runner({
  permissions: 'prompt',
  onPermission: async ({ tool, description }) => {
    return confirm(`Allow ${tool}? ${description}`);
  },
});

// Fine-grained policy
const runner = new Runner({
  permissions: {
    allow: ['Read', 'Glob', 'Grep', 'mcp__github__*'],
    deny: ['Bash(rm *)'],
    prompt: ['Bash', 'Write'],
  },
  onPermission: async (req) => confirm(`Allow ${req.tool}?`),
});
```

## Sandbox (Coming Soon)

Run agents in isolated environments:

```typescript
// E2B cloud sandbox
const runner = new Runner({ sandbox: 'e2b' });

// Docker container
const runner = new Runner({ sandbox: 'docker' });

// Custom spawner
const runner = new Runner({
  sandbox: (options) => myCustomSpawner(options),
});
```

## Subagents

Define programmatic subagents:

```typescript
const runner = new Runner({
  agents: {
    researcher: {
      description: 'Research agent for gathering information',
      prompt: 'You are a research assistant. Search thoroughly.',
      tools: ['Read', 'Glob', 'Grep', 'WebSearch'],
      model: 'haiku',
    },
    coder: {
      description: 'Coding agent for implementation',
      prompt: 'You are an expert programmer. Write clean code.',
      tools: ['Read', 'Write', 'Edit', 'Bash'],
      model: 'sonnet',
    },
  },
});
```

## API Reference

### `Runner`

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

### `RunResult`

```typescript
interface RunResult {
  text: string;            // Final response text
  sessionId: string;       // For resume
  cost: number;            // USD
  duration: number;        // ms
  usage: { input; output }; // Token counts
  turns: number;           // Agentic turns
  toolCalls: ToolCallSummary[];
  error?: string;
}
```

### `RunEvent` (7 types)

| Type | Fields | When |
|---|---|---|
| `text` | `text` | Each streamed text chunk |
| `tool_start` | `tool`, `id` | Tool execution begins |
| `tool_end` | `tool`, `id`, `duration` | Tool execution ends |
| `session_init` | `sessionId`, `model`, `tools` | Session initialized |
| `mcp_status` | `server`, `status` | MCP server connected/failed |
| `error` | `message`, `code?` | Error occurred |
| `done` | `result` | Run complete |

### `RunStream`

```typescript
interface RunStream extends AsyncIterable<RunEvent> {
  result: Promise<RunResult>;   // Await final result
  text: Promise<string>;        // Await full text
  send(message: string): void;  // Inject mid-stream message
  interrupt(): Promise<void>;   // Pause execution
  abort(): void;                // Stop completely
  sessionId: string | null;     // Current session ID
}
```

### `RunnerOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | `'claude-sonnet-4-6'` | Claude model |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `systemPrompt` | `string \| { preset: 'claude_code' }` | minimal | System prompt |
| `mcp` | `Record<string, McpConfig \| string>` | `{}` | MCP servers |
| `tools` | `ToolDefinition[]` | `[]` | Custom tools |
| `agents` | `Record<string, AgentDefinition>` | — | Subagents |
| `sandbox` | `'local' \| 'e2b' \| 'docker' \| SpawnFn` | `'local'` | Execution environment |
| `permissions` | `'auto' \| 'prompt' \| 'deny-unknown' \| PermissionPolicy` | `'deny-unknown'` | Permission handling |
| `onPermission` | `(req) => Promise<boolean>` | — | Permission callback |
| `maxTurns` | `number` | — | Max agentic turns |
| `maxBudget` | `number` | — | Max cost in USD |
| `effort` | `'low' \| 'medium' \| 'high' \| 'max'` | — | Effort level |
| `sdkOptions` | `object` | — | Pass-through to Agent SDK |

## Runtime Support

claude-runner is runtime-agnostic. No framework lock-in.

- **Node.js** 18+
- **Bun**
- **Deno**
- **Electron** (for desktop apps)
- **Any cloud** — AWS, GCP, Azure, self-hosted

## How It Works

claude-runner is a thin wrapper (~500 lines) around the official `@anthropic-ai/claude-agent-sdk`. It:

1. Normalizes your options into the SDK's 40+ field `Options` object
2. Starts a `query()` session with MCP servers, permissions, and tools configured
3. Transforms the SDK's 20+ `SDKMessage` types into 7 flat `RunEvent` types
4. Manages session lifecycle (resume, multi-turn, abort)

You get the full power of Claude Code (skills, agents, tools, MCP) through a simple API.

## License

MIT
