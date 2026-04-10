# Real-World Use Cases

## Agent Mode (CLI required)

### Code reviewer

```typescript
const runner = new Runner({ permissions: 'auto' });
const result = await runner.run('Review src/ for bugs, security issues, and code quality');
```

### Test generator

```typescript
const r1 = await runner.run('Analyze this project and list files that need tests');
const r2 = await runner.resume(r1.sessionId, 'Generate tests for the top 3 files').result;
```

### Documentation generator

```typescript
const runner = new Runner({
  permissions: 'auto',
  systemPrompt: 'You are a technical writer. Generate clear, concise docs.',
});
const result = await runner.run('Read the source code and generate API documentation');
```

### Codebase migration

```typescript
const runner = new Runner({
  permissions: 'auto',
  model: 'opus',
  maxTurns: 50,
});
const result = await runner.run('Migrate all JavaScript files in src/ to TypeScript');
```

### CI/CD agent

```bash
npx claude-runner -p auto "Run tests. If any fail, fix them and run again."
```

---

## API Mode (no CLI, deploys anywhere)

### Customer support chatbot

```typescript
const runner = new Runner({
  apiKey: process.env.ANTHROPIC_API_KEY,
  tools: [lookupOrder, checkInventory, createTicket],
  systemPrompt: 'You are a helpful support agent for an e-commerce store.',
});

const result = await runner.run(userMessage);
```

### Content pipeline

```typescript
// Generate blog post from topic
const runner = new Runner({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'opus',
  maxTurns: 1,
});

const result = await runner.run(
  'Write a 500-word blog post about TypeScript best practices in 2026'
);
await saveToCSM(result.text);
```

### Slack bot

```typescript
app.event('message', async ({ event }) => {
  const runner = new Runner({
    apiKey: process.env.ANTHROPIC_API_KEY,
    tools: [searchDocs, queryDatabase],
    maxTurns: 5,
  });

  const result = await runner.run(event.text);
  await say(result.text);
});
```

### Data analysis API

```typescript
app.post('/analyze', async (req, res) => {
  const runner = new Runner({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'haiku',
  });

  const result = await runner.run(
    `Analyze this JSON data and return insights:\n${JSON.stringify(req.body.data)}`
  );

  res.json({ insights: result.text, cost: result.cost });
});
```

### GitHub Actions bot

```yaml
- name: AI Code Review
  run: |
    ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }} \
    npx claude-runner --api-key $ANTHROPIC_API_KEY \
      "Review the diff in this PR for bugs: $(gh pr diff ${{ github.event.number }})"
```

### Webhook processor

```typescript
// Process incoming webhooks with Claude
app.post('/webhook/:type', async (req, res) => {
  const runner = new Runner({
    apiKey: process.env.ANTHROPIC_API_KEY,
    tools: [updateCRM, sendEmail, createTask],
    systemPrompt: `You process ${req.params.type} webhooks. Extract data and take action.`,
  });

  const result = await runner.run(JSON.stringify(req.body));
  res.json({ processed: true, actions: result.toolCalls.length });
});
```
