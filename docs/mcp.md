# MCP Integration

Connect to any [MCP server](https://github.com/modelcontextprotocol/servers) with shorthand strings or full config objects.

## Shorthand strings

```typescript
const runner = new Runner({
  mcp: {
    // Command string — auto-parsed into command + args
    github: 'npx @modelcontextprotocol/server-github',

    // URL — treated as HTTP/SSE server
    docs: 'https://api.example.com/mcp',
  },
});
```

## Full config

```typescript
const runner = new Runner({
  mcp: {
    postgres: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-postgres', process.env.DATABASE_URL!],
      env: { PGPASSWORD: process.env.PGPASSWORD! },
    },
    internal: {
      type: 'http',
      url: 'https://mcp.internal.company.com',
      headers: { Authorization: `Bearer ${process.env.TOKEN}` },
    },
  },
});
```

## Tool auto-discovery

All MCP tools are auto-discovered and auto-allowed. Claude sees them immediately — no manual tool registration.

Internally, tool names follow the pattern `mcp__<server>__<tool>`. For example, tools from a `github` server become `mcp__github__list_issues`, `mcp__github__create_pr`, etc.

## Per-run MCP overrides

Add MCP servers for a specific run without changing the runner config:

```typescript
const runner = new Runner({
  mcp: { github: 'npx @modelcontextprotocol/server-github' },
});

// This run also gets the database server
const result = await runner.run('Query user signups from last week', {
  mcp: { database: 'npx @modelcontextprotocol/server-postgres' },
});
```

Per-run servers are merged with constructor servers.

## Common servers

| Server | Shorthand | Tools |
|---|---|---|
| **GitHub** | `'npx @modelcontextprotocol/server-github'` | Issues, PRs, repos, files |
| **Playwright** | `'npx @playwright/mcp@latest'` | Browser automation |
| **PostgreSQL** | `'npx @modelcontextprotocol/server-postgres'` | Database queries |
| **Filesystem** | `'npx @modelcontextprotocol/server-filesystem /path'` | File read/write |
| **Slack** | `'npx @modelcontextprotocol/server-slack'` | Messages, channels |

## Custom tools (in-process)

For tools that run in your Node.js process (not as a subprocess):

```typescript
import { Runner, defineTool } from 'claude-runner';
import { z } from 'zod';

const weather = defineTool(
  'get_weather',
  'Get current weather for a city',
  { city: z.string() },
  async ({ city }) => ({
    content: [{ type: 'text', text: `72°F in ${city}` }],
  })
);

const runner = new Runner({ tools: [weather] });
```

Custom tools are served via an in-process MCP server (`claude-runner-tools`) — Claude sees them alongside any external MCP tools.
