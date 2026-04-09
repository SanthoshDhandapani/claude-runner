#!/usr/bin/env node
/**
 * Example: AI Code Reviewer
 *
 * Runs Claude as a code reviewer on the current directory.
 * Streams output in real time with tool call indicators.
 *
 * Usage:
 *   node examples/code-reviewer.js
 *   node examples/code-reviewer.js --model opus
 */

import { Runner } from "claude-runner";

const model = process.argv.includes("--model")
  ? process.argv[process.argv.indexOf("--model") + 1]
  : "sonnet";

const runner = new Runner({
  model,
  permissions: "deny-unknown",
});

console.error(`\n🔍 Starting code review with ${model}...\n`);

for await (const event of runner.stream(
  "Review this codebase for bugs, security issues, and code quality problems. " +
  "Focus on the most critical issues. Be concise."
)) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "tool_start":
      console.error(`\n  → ${event.tool}`);
      break;
    case "tool_end":
      console.error(`  ← ${event.tool} (${event.duration}ms)`);
      break;
    case "done":
      console.error(`\n\n✅ Review complete`);
      console.error(`   Cost: $${event.result.cost.toFixed(4)}`);
      console.error(`   Tokens: ${event.result.usage.input + event.result.usage.output}`);
      console.error(`   Duration: ${(event.result.duration / 1000).toFixed(1)}s`);
      console.error(`   Session: ${event.result.sessionId}\n`);
      break;
    case "error":
      console.error(`\n❌ Error: ${event.message}`);
      break;
  }
}
