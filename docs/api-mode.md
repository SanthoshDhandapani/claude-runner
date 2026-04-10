# API Mode

Run Claude agents without the CLI — just an API key. Deploys to Lambda, Cloud Run, Vercel, or any serverless platform.

## Setup

```typescript
import { Runner } from 'claude-runner';

const runner = new Runner({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const result = await runner.run('Summarize this quarter sales data');
console.log(result.text);
console.log(`Cost: $${result.cost.toFixed(4)}`);
```

Or set the env var and the CLI auto-detects:

```bash
ANTHROPIC_API_KEY=sk-xxx npx claude-runner "Summarize this data"
```

## How it works

API Mode uses the `@anthropic-ai/sdk` Messages API directly with an agentic tool loop:

1. Send prompt to Claude
2. Claude responds — if it requests `tool_use`, execute the tool locally
3. Send `tool_result` back to Claude
4. Repeat until Claude says `end_turn`

This is the same pattern used by the official SDK's `toolRunner()`, but wrapped in claude-runner's flat event model.

## Custom tools

API Mode supports `defineTool()` — your tools run in-process:

```typescript
import { Runner, defineTool } from 'claude-runner';
import { z } from 'zod';

const lookupUser = defineTool(
  'lookup_user',
  'Look up a user by email',
  { email: z.string().email() },
  async ({ email }) => ({
    content: [{ type: 'text', text: JSON.stringify({ name: 'Alice', email, plan: 'pro' }) }],
  })
);

const runner = new Runner({
  apiKey: process.env.ANTHROPIC_API_KEY,
  tools: [lookupUser],
});

const result = await runner.run('Look up alice@example.com and summarize her account');
```

## Agent Mode vs API Mode

| | Agent Mode | API Mode |
|---|---|---|
| **Requires** | Claude CLI | API key |
| **Built-in tools** | Read, Write, Bash, Edit, Glob, Grep | None — bring your own |
| **Custom tools** | `defineTool()` | `defineTool()` |
| **MCP servers** | Full support | Coming soon |
| **Sandbox** | Docker, E2B | Not available |
| **Hooks & skills** | Full support | Not available |
| **Subagents** | Full support | Not available |
| **Session resume** | Full support | Not available |
| **Multi-turn** | `stream.send()` | Not available |
| **Streaming** | Yes | Yes |
| **Deploys to** | Machines with CLI | Anywhere |
| **Cost** | Claude subscription | Pay-per-token |

## Real-world use cases

### SaaS chatbot (Cloud Run)

```typescript
import express from 'express';
import { Runner, defineTool } from 'claude-runner';

const app = express();
app.use(express.json());

const lookupOrder = defineTool('lookup_order', 'Find order by ID', 
  { orderId: z.string() },
  async ({ orderId }) => ({
    content: [{ type: 'text', text: `Order ${orderId}: shipped, arrives tomorrow` }],
  })
);

app.post('/chat', async (req, res) => {
  const runner = new Runner({
    apiKey: process.env.ANTHROPIC_API_KEY,
    tools: [lookupOrder],
    systemPrompt: 'You are a helpful customer support agent.',
    maxTurns: 5,
  });

  const result = await runner.run(req.body.message);
  res.json({ reply: result.text, cost: result.cost });
});
```

### Data pipeline (AWS Lambda)

```typescript
export const handler = async (event) => {
  const runner = new Runner({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'haiku', // fast + cheap
    maxTurns: 3,
  });

  const csvData = event.Records[0].body;
  const result = await runner.run(
    `Analyze this CSV data and return a JSON summary:\n\n${csvData}`
  );

  return { statusCode: 200, body: result.text };
};
```

### GitHub webhook (code review bot)

```typescript
app.post('/webhook', async (req, res) => {
  const { pull_request } = req.body;
  
  const runner = new Runner({
    apiKey: process.env.ANTHROPIC_API_KEY,
    systemPrompt: 'You are a senior code reviewer. Be concise.',
    maxTurns: 1,
  });

  const result = await runner.run(
    `Review this PR diff for bugs and security issues:\n\n${pull_request.diff}`
  );

  // Post review comment via GitHub API
  await postComment(pull_request.number, result.text);
  res.sendStatus(200);
});
```

## Install the SDK

API Mode requires `@anthropic-ai/sdk` as a peer dependency:

```bash
npm install claude-runner @anthropic-ai/sdk
```

## Budget control

```typescript
const runner = new Runner({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxBudget: 0.50,  // Stop at $0.50
  maxTurns: 10,     // Max 10 tool call rounds
});
```

The runner tracks cost per turn and stops when the budget is exceeded.
