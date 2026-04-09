# Multi-turn & Sessions

## Single run

```typescript
const result = await runner.run('Explain the architecture');
console.log(result.text);
```

`run()` returns when the agent is done. The session is complete.

## Streaming

```typescript
const stream = runner.stream('Build a REST API');

for await (const event of stream) {
  if (event.type === 'text') process.stdout.write(event.text);
}

const result = await stream.result;
```

`stream()` returns a `RunStream` — an async iterable of `RunEvent` objects.

## Mid-stream messages

Inject messages while the agent is working:

```typescript
const stream = runner.stream('Build a user management API');

// Redirect mid-stream
setTimeout(() => stream.send('Use Express, not Fastify'), 5000);

for await (const event of stream) {
  if (event.type === 'text') process.stdout.write(event.text);
}
```

## Session resume

Continue a previous conversation with full context:

```typescript
const r1 = await runner.run('Analyze the auth module');

// Later — resume with the same session
const stream = runner.resume(r1.sessionId, 'Now refactor it');
const r2 = await stream.result;
```

`resume()` returns a `RunStream` so you can stream or await.

## Interrupt

Pause the agent mid-stream:

```typescript
const stream = runner.stream('Review all files in src/');

// Pause after 10 seconds
setTimeout(async () => {
  await stream.interrupt();
  stream.send('Skip the test files, focus on production code');
}, 10_000);

for await (const event of stream) {
  if (event.type === 'text') process.stdout.write(event.text);
}
```

## Abort

Kill the session:

```typescript
const stream = runner.stream('Long running task...');

// Cancel after 30 seconds
setTimeout(() => stream.abort(), 30_000);

for await (const event of stream) {
  if (event.type === 'text') process.stdout.write(event.text);
}
```

Or abort from the runner:

```typescript
runner.abort(); // Kills any active query
```

## RunStream API

```typescript
interface RunStream extends AsyncIterable<RunEvent> {
  result: Promise<RunResult>;     // Resolves on completion
  text: Promise<string>;          // Shorthand for result.text
  sessionId: string | null;       // Current session ID

  send(message: string): void;    // Inject mid-stream message
  interrupt(): Promise<void>;     // Pause (session alive)
  abort(): void;                  // Kill (session dead)
}
```

## Interrupt vs Abort

| | `interrupt()` | `abort()` |
|---|---|---|
| Session alive | Yes | No |
| Can `send()` | Yes | No |
| Can `resume()` later | Yes | Yes |
| Returns | `Promise<void>` | `void` |
