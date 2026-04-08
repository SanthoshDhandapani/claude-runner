#!/usr/bin/env node
/**
 * cli.ts — Claude Runner CLI.
 *
 * Run AI agents from the command line:
 *   npx claude-runner "Analyze this codebase"
 *   npx claude-runner --model opus "Fix the tests"
 *   npx claude-runner --mcp github="npx @modelcontextprotocol/server-github" "List issues"
 *   npx claude-runner --permissions auto "Deploy the app"
 */

import { Runner } from "./runner.js";
import { resolveModel } from "./models.js";
import type { McpConfig, RunnerOptions } from "./types.js";

function printHelp(): void {
  console.log(`
claude-runner — The easiest way to build AI agents with Claude.

Usage:
  npx claude-runner [options] <prompt>

Options:
  --model, -m <model>        Model shorthand or full ID (default: sonnet)
                              Shorthands: opus, sonnet, haiku, opus-4.5, sonnet-4.5
  --mcp <name>=<config>      Add MCP server (repeatable)
                              npx: --mcp github="npx @modelcontextprotocol/server-github"
                              url: --mcp api="https://api.example.com/mcp"
  --permissions, -p <mode>   Permission mode: auto, prompt, deny-unknown (default: prompt)
  --cwd <dir>                Working directory (default: current)
  --system <prompt>          Custom system prompt
  --max-turns <n>            Max agentic turns
  --max-budget <usd>         Max cost in USD
  --resume <sessionId>       Resume a previous session
  --json                     Output result as JSON (no streaming)
  --help, -h                 Show this help

Examples:
  npx claude-runner "Explain what this project does"
  npx claude-runner -m opus "Refactor the auth module"
  npx claude-runner --mcp github="npx @modelcontextprotocol/server-github" "List open issues"
  npx claude-runner -p auto "Fix all failing tests"
  npx claude-runner --resume abc-123 "Now deploy it"
`);
}

function parseArgs(args: string[]): {
  prompt: string;
  options: RunnerOptions;
  resumeSessionId?: string;
  json?: boolean;
} {
  const options: RunnerOptions = {};
  const mcpServers: Record<string, McpConfig> = {};
  let prompt = "";
  let resumeSessionId: string | undefined;
  let json = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--model" || arg === "-m") {
      options.model = args[++i];
    } else if (arg === "--mcp") {
      const val = args[++i] ?? "";
      const eqIdx = val.indexOf("=");
      if (eqIdx > 0) {
        const name = val.slice(0, eqIdx);
        const config = val.slice(eqIdx + 1);
        mcpServers[name] = config;
      }
    } else if (arg === "--permissions" || arg === "-p") {
      const mode = args[++i] as "auto" | "prompt" | "deny-unknown";
      options.permissions = mode;
    } else if (arg === "--cwd") {
      options.cwd = args[++i];
    } else if (arg === "--system") {
      options.systemPrompt = args[++i];
    } else if (arg === "--max-turns") {
      options.maxTurns = parseInt(args[++i] ?? "0", 10);
    } else if (arg === "--max-budget") {
      options.maxBudget = parseFloat(args[++i] ?? "0");
    } else if (arg === "--resume") {
      resumeSessionId = args[++i];
    } else if (arg === "--json") {
      json = true;
    } else if (!arg.startsWith("-")) {
      prompt = arg;
    }
    i++;
  }

  if (Object.keys(mcpServers).length > 0) {
    options.mcp = mcpServers;
  }

  if (!options.permissions) {
    options.permissions = "prompt";
  }

  return { prompt, options, resumeSessionId, json };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const { prompt, options, resumeSessionId, json } = parseArgs(args);

  if (!prompt && !resumeSessionId) {
    console.error("Error: No prompt provided. Use --help for usage.");
    process.exit(1);
  }

  const runner = new Runner(options);

  if (json) {
    // JSON mode — no streaming, just output result
    const result = resumeSessionId
      ? await runner.resume(resumeSessionId, prompt).result
      : await runner.run(prompt);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Streaming mode
  const stream = resumeSessionId
    ? runner.resume(resumeSessionId, prompt)
    : runner.stream(prompt);

  for await (const event of stream) {
    switch (event.type) {
      case "text":
        process.stdout.write(event.text);
        break;
      case "tool_start":
        process.stderr.write(`\x1b[36m[${event.tool}]\x1b[0m `);
        break;
      case "tool_end":
        process.stderr.write(`\x1b[36m(${(event.duration / 1000).toFixed(1)}s)\x1b[0m\n`);
        break;
      case "mcp_status":
        if (event.status === "connected") {
          process.stderr.write(`\x1b[32m✓ ${event.server}\x1b[0m\n`);
        } else if (event.status === "failed") {
          process.stderr.write(`\x1b[31m✕ ${event.server}\x1b[0m\n`);
        }
        break;
      case "error":
        process.stderr.write(`\x1b[31mError: ${event.message}\x1b[0m\n`);
        break;
      case "done":
        process.stderr.write(
          `\n\x1b[90m— ${event.result.turns} turns, $${event.result.cost.toFixed(4)}, ` +
          `${event.result.usage.input}/${event.result.usage.output} tokens` +
          (event.result.sessionId ? `, session: ${event.result.sessionId}` : "") +
          `\x1b[0m\n`
        );
        break;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
