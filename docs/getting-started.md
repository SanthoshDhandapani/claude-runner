# Getting Started

Build your first Claude-powered agent in 5 minutes.

## Prerequisites

- **Node.js 18+** (recommended: 22 LTS)
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/getting-started)** installed and authenticated

## Install

```bash
npm install claude-runner
```

## Your first agent

```typescript
import { Runner } from 'claude-runner';

const runner = new Runner();
const result = await runner.run('List the top 5 files by size in this directory');

console.log(result.text);
console.log(`Cost: $${result.cost.toFixed(4)}`);
console.log(`Turns: ${result.turns}`);
```

That's it. `run()` handles session creation, tool calls, streaming, and cleanup internally.

## Streaming

Watch the agent work in real time:

```typescript
for await (const event of runner.stream('Refactor the auth module')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.text);
      break;
    case 'tool_start':
      console.error(`\n  -> ${event.tool}`);
      break;
    case 'tool_end':
      console.error(`  <- ${event.tool} (${event.duration}ms)`);
      break;
    case 'done':
      console.error(`\nCost: $${event.result.cost.toFixed(4)}`);
      break;
  }
}
```

## Add MCP tools

Give Claude access to external tools:

```typescript
const runner = new Runner({
  mcp: {
    github: 'npx @modelcontextprotocol/server-github',
  },
});

const result = await runner.run('List open PRs and summarize the most recent one');
```

Shorthand strings are auto-parsed. Tools are auto-discovered.

## Multi-turn

Send follow-up messages:

```typescript
const r1 = await runner.run('Review src/auth.ts for bugs');

// Resume with full context
const r2 = await runner.resume(r1.sessionId, 'Now fix the issues you found').result;
```

## CLI

Run agents from your terminal:

```bash
npx claude-runner "Fix all failing tests"
npx claude-runner -m opus "Refactor the auth module"
npx claude-runner --mcp github="npx @modelcontextprotocol/server-github" "List open issues"
```

## Next steps

- [Sandbox](./sandbox.md) — Docker container isolation
- [MCP Integration](./mcp.md) — Connect any MCP server
- [Sessions](./sessions.md) — Multi-turn, resume, interrupt
- [Permissions](./permissions.md) — Control what Claude can do
- [API Reference](./api.md) — Full TypeScript API
