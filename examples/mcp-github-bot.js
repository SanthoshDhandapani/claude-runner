#!/usr/bin/env node
/**
 * Example: GitHub Issue Analyzer
 *
 * Uses MCP to connect to GitHub, reads issues, and provides analysis.
 * Demonstrates MCP shorthand config and structured output.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node examples/mcp-github-bot.js
 *
 * Requires: GITHUB_TOKEN environment variable
 */

import { Runner } from "claude-runner";

if (!process.env.GITHUB_TOKEN) {
  console.error("❌ Set GITHUB_TOKEN environment variable first");
  console.error("   GITHUB_TOKEN=ghp_xxx node examples/mcp-github-bot.js");
  process.exit(1);
}

const runner = new Runner({
  model: "sonnet",
  mcp: {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
    },
  },
  permissions: "auto",
  maxTurns: 10,
});

const repo = process.argv[2] ?? "anthropics/claude-code";

console.error(`\n🐙 Analyzing issues for ${repo}...\n`);

for await (const event of runner.stream(
  `Look at the open issues for the GitHub repo "${repo}". ` +
  "Summarize the top 5 most recent issues in a table with columns: " +
  "Number, Title, Labels, and a one-line summary. " +
  "Then identify any common themes or patterns across the issues."
)) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "mcp_status":
      if (event.status === "connected") {
        console.error(`  ✓ MCP: ${event.server} connected`);
      } else {
        console.error(`  ✗ MCP: ${event.server} ${event.status}`);
      }
      break;
    case "tool_start":
      console.error(`  → ${event.tool}`);
      break;
    case "done":
      console.error(`\n\n✅ Analysis complete`);
      console.error(`   Cost: $${event.result.cost.toFixed(4)}`);
      console.error(`   MCP tool calls: ${event.result.toolCalls.filter(t => t.tool.startsWith("mcp__")).length}\n`);
      break;
  }
}
