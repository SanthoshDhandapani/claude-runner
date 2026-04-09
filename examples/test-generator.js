#!/usr/bin/env node
/**
 * Example: AI Test Generator
 *
 * Analyzes source code and generates test files.
 * Demonstrates multi-turn: first analyzes, then generates on approval.
 *
 * Usage:
 *   node examples/test-generator.js
 */

import { Runner } from "claude-runner";

const runner = new Runner({
  model: "sonnet",
  permissions: "auto",
  maxTurns: 20,
});

// Step 1: Analyze the codebase
console.error("\n📋 Analyzing codebase for testable code...\n");

const analysis = await runner.run(
  "Analyze this project and list the top 3 files that need tests the most. " +
  "For each file, explain what should be tested. Be concise — bullet points only."
);

console.log(analysis.text);
console.error(`\n   Cost so far: $${analysis.cost.toFixed(4)}\n`);

// Step 2: Generate tests (resume the session for full context)
console.error("🧪 Generating tests...\n");

const stream = runner.resume(
  analysis.sessionId,
  "Now generate the tests for the #1 file you identified. " +
  "Write a proper test file using the project's existing test framework, or node:test if none exists. " +
  "Save the test file to disk."
);

for await (const event of stream) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "tool_start":
      if (event.tool === "Write") {
        console.error(`\n  📝 Writing: ${event.input?.file_path ?? "file"}`);
      }
      break;
    case "done":
      console.error(`\n\n✅ Tests generated`);
      console.error(`   Total cost: $${(analysis.cost + event.result.cost).toFixed(4)}`);
      console.error(`   Files written: ${event.result.toolCalls.filter(t => t.tool === "Write").length}\n`);
      break;
  }
}
