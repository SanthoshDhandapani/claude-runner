/**
 * runner.ts — The Runner class. The core of claude-runner.
 *
 * 5 lines to start:
 *   const runner = new Runner();
 *   const result = await runner.run('Analyze this codebase');
 *   console.log(result.text);
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { RunnerOptions, RunResult, RunOverrides, RunEvent, RunnerHookDeclarations, RunnerHookMatcher, HookRule } from "./types.js";
import { resolveModel } from "./models.js";
import { RunStream } from "./stream.js";
import { EventParser } from "./event-parser.js";
import { MessageQueue } from "./message-queue.js";
import { normalizeMcpConfig, buildMcpAllowedTools } from "./mcp.js";
import { buildCanUseTool } from "./permissions.js";
import { createSpawner } from "./sandbox/index.js";
import { isRunnerTool } from "./tools.js";

export class Runner {
  private options: RunnerOptions;
  private _lastSessionId: string | null = null;
  private abortCtrl: AbortController | null = null;
  private activeQuery: ReturnType<typeof query> | null = null;
  private messageQueue: MessageQueue | null = null;

  constructor(options?: RunnerOptions) {
    this.options = options ?? {};
  }

  /**
   * Run a prompt and return the complete result.
   * The simplest way to use claude-runner.
   *
   * @example
   * ```typescript
   * const result = await runner.run('Fix the failing tests');
   * console.log(result.text);
   * console.log(`Cost: $${result.cost.toFixed(4)}`);
   * ```
   */
  async run(prompt: string, overrides?: RunOverrides): Promise<RunResult> {
    const stream = this.stream(prompt, overrides);
    // Consume all events to drive the stream, return final result
    for await (const _event of stream) {
      // Events are consumed but not needed for run()
    }
    return stream.result;
  }

  /**
   * Stream a prompt and return an async iterable of events.
   * Use for real-time UI updates.
   *
   * @example
   * ```typescript
   * for await (const event of runner.stream('Build a REST API')) {
   *   if (event.type === 'text') process.stdout.write(event.text);
   * }
   * ```
   */
  stream(prompt: string, overrides?: RunOverrides): RunStream {
    const runStream = new RunStream();

    // Start the SDK query in the background
    this._startQuery(prompt, overrides, runStream).catch((err) => {
      runStream._push({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      runStream._end(err instanceof Error ? err : new Error(String(err)));
    });

    return runStream;
  }

  /**
   * Resume a previous session with an optional follow-up prompt.
   *
   * @example
   * ```typescript
   * const r1 = await runner.run('Analyze the auth module');
   * const stream = runner.resume(r1.sessionId, 'Now refactor it');
   * ```
   */
  resume(sessionId: string, prompt?: string): RunStream {
    const runStream = new RunStream();

    this._startQuery(prompt ?? "", { _resumeSessionId: sessionId } as RunOverrides & { _resumeSessionId: string }, runStream).catch((err) => {
      runStream._push({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      runStream._end(err instanceof Error ? err : new Error(String(err)));
    });

    return runStream;
  }

  /** Session ID from the last completed run. */
  get lastSessionId(): string | null {
    return this._lastSessionId;
  }

  /** Abort any running query. */
  abort(): void {
    this.abortCtrl?.abort();
    this.messageQueue?.close();
    try {
      this.activeQuery?.close();
    } catch { /* ignore */ }
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async _startQuery(
    prompt: string,
    overrides: (RunOverrides & { _resumeSessionId?: string }) | undefined,
    runStream: RunStream
  ): Promise<void> {
    const opts = this.options;
    this.abortCtrl = new AbortController();
    this.messageQueue = new MessageQueue();

    // Merge MCP configs (constructor + per-run overrides)
    const mcpInput = { ...(opts.mcp ?? {}), ...(overrides?.mcp ?? {}) };
    const mcpServers = Object.keys(mcpInput).length > 0
      ? normalizeMcpConfig(mcpInput)
      : {};

    // Build allowed tools list (auto-allow all MCP tools)
    const mcpAllowed = buildMcpAllowedTools(Object.keys(mcpServers));
    const baseAllowed = [
      "Read", "Glob", "Grep", "Write", "Edit", "Bash",
      "Agent", "Skill", "ToolSearch",
      ...mcpAllowed,
    ];

    // Build permission handler
    const permissions = opts.permissions ?? "deny-unknown";
    const isAuto = permissions === "auto";
    const canUseTool = buildCanUseTool(permissions, opts.onPermission);

    // Sandbox spawner
    const spawner = createSpawner(
      opts.sandbox ?? "local",
      opts.e2b,
      opts.docker
    );

    // System prompt
    let systemPrompt: string | { type: "preset"; preset: "claude_code"; append?: string } | undefined;
    const sp = overrides?.systemPrompt ?? opts.systemPrompt;
    if (typeof sp === "string") {
      systemPrompt = sp;
    } else if (sp && "preset" in sp) {
      systemPrompt = { type: "preset", preset: sp.preset, append: sp.append };
    }

    // Custom tools → in-process MCP server
    const customTools = (opts.tools ?? []).filter(isRunnerTool);
    if (customTools.length > 0) {
      // Dynamically create an SDK MCP server for custom tools
      const { createSdkMcpServer, tool: sdkTool } = await import("@anthropic-ai/claude-agent-sdk");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdkTools = customTools.map((t) =>
        sdkTool(t.name, t.description, t.schema as any, t.handler as any)
      );
      const inProcessServer = createSdkMcpServer({
        name: "claude-runner-tools",
        tools: sdkTools,
      });
      (mcpServers as Record<string, unknown>)["claude-runner-tools"] = inProcessServer;
      baseAllowed.push("mcp__claude-runner-tools__*");
    }

    // Resolve declarative hooks into SDK callbacks
    let resolvedHooks: Record<string, unknown[]> | undefined;
    if (opts.hooks && Object.keys(opts.hooks).length > 0) {
      try {
        // Try @specwright/hooks first (full resolution with modules support)
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const dynamicImport = new Function("specifier", "return import(specifier)") as (s: string) => Promise<unknown>;
        const hooksModule = await dynamicImport("@specwright/hooks") as {
          resolveSkillHooks: (decl: Record<string, unknown[]>, opts?: { cwd?: string }) => Promise<Record<string, unknown[]>>;
        };
        resolvedHooks = await hooksModule.resolveSkillHooks(
          opts.hooks as Record<string, unknown[]>,
          { cwd: opts.cwd ?? process.cwd() }
        );
      } catch {
        // Fallback: resolve inline rules + direct callbacks without @specwright/hooks
        resolvedHooks = resolveHooksInline(opts.hooks);
      }
    }

    // Build SDK options
    const sdkOptions: Record<string, unknown> = {
      systemPrompt,
      cwd: opts.cwd ?? process.cwd(),
      model: resolveModel(overrides?.model ?? opts.model),
      abortController: this.abortCtrl,
      includePartialMessages: true,
      includeHookEvents: true,
      mcpServers,
      allowedTools: baseAllowed,
      canUseTool,
      ...(isAuto ? {
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      } : {}),
      ...(opts.maxTurns ? { maxTurns: opts.maxTurns } : {}),
      ...(opts.maxBudget ? { maxBudgetUsd: opts.maxBudget } : {}),
      ...(opts.effort ? { effort: opts.effort } : {}),
      settingSources: opts.settingSources ?? [],
      ...(opts.agents ? { agents: opts.agents } : {}),
      ...(spawner ? { spawnClaudeCodeProcess: spawner } : {}),
      ...(overrides?.outputFormat ? { outputFormat: overrides.outputFormat } : {}),
      ...(overrides?._resumeSessionId ? { resume: overrides._resumeSessionId } : {}),
      ...(overrides?.signal ? {} : {}), // signal handled via abortController
      ...(resolvedHooks ? { hooks: resolvedHooks } : {}),
      ...(opts.sdkOptions ?? {}),
    };

    // Start the query
    this.activeQuery = query({
      prompt,
      options: sdkOptions as Parameters<typeof query>[0]["options"],
    });

    // Wire stream input for multi-turn
    this.activeQuery.streamInput(
      this.messageQueue as unknown as AsyncIterable<{
        type: "user";
        message: { role: "user"; content: string };
        parent_tool_use_id: null;
      }>
    );

    // Wire RunStream controls
    runStream._wire({
      abort: () => this.abort(),
      interrupt: async () => { await this.activeQuery?.interrupt(); },
      messageQueue: this.messageQueue,
    });

    // Parse SDK messages into RunEvents
    const parser = new EventParser();

    try {
      for await (const message of this.activeQuery) {
        const events = parser.parse(message as Record<string, unknown>);
        for (const event of events) {
          runStream._push(event);
        }
      }
    } finally {
      this._lastSessionId = parser.getSessionId();
      this.messageQueue?.close();
      this.messageQueue = null;
      this.activeQuery = null;
      this.abortCtrl = null;
    }

    runStream._end();
  }
}

// ─── Inline hook resolver (no @specwright/hooks dependency needed) ──────

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const lastSlash = pattern.lastIndexOf("/");
    try {
      return new RegExp(pattern.slice(1, lastSlash), pattern.slice(lastSlash + 1)).test(value);
    } catch { /* fall through */ }
  }
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(escaped).test(value);
  }
  return value.includes(pattern);
}

function compileRulesCallback(rules: HookRule[]): (
  input: Record<string, unknown>,
  toolUseId: string | undefined,
  opts: { signal: AbortSignal }
) => Promise<Record<string, unknown>> {
  return async (input) => {
    const toolInput = input.tool_input as Record<string, unknown> | undefined;
    const value = String(toolInput?.command ?? toolInput?.file_path ?? toolInput?.pattern ?? JSON.stringify(toolInput ?? {}));

    for (const rule of rules) {
      if (rule.deny && matchesPattern(value, rule.deny)) {
        return { decision: "block", reason: rule.reason ?? `Blocked: ${rule.deny}` };
      }
      if (rule.allow && matchesPattern(value, rule.allow)) {
        return {
          hookSpecificOutput: {
            hookEventName: input.hook_event_name ?? "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: rule.reason,
          },
        };
      }
      if (rule.context) {
        return {
          hookSpecificOutput: {
            hookEventName: input.hook_event_name ?? "PreToolUse",
            additionalContext: rule.context,
          },
        };
      }
    }
    return { continue: true };
  };
}

/**
 * Fallback resolver for inline rules + direct callbacks.
 * Used when @specwright/hooks is not installed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHookCallback = (...args: any[]) => Promise<any>;

function resolveHooksInline(
  declarations: RunnerHookDeclarations
): Record<string, Array<{ matcher?: string; timeout?: number; hooks: AnyHookCallback[] }>> {
  const resolved: Record<string, Array<{ matcher?: string; timeout?: number; hooks: AnyHookCallback[] }>> = {};

  for (const [event, matchers] of Object.entries(declarations)) {
    if (!matchers || matchers.length === 0) continue;

    resolved[event] = matchers.map((m: RunnerHookMatcher) => {
      const hooks: AnyHookCallback[] = [];

      if (m.rules && m.rules.length > 0) {
        hooks.push(compileRulesCallback(m.rules) as AnyHookCallback);
      }
      if (m.callbacks) {
        hooks.push(...(m.callbacks as AnyHookCallback[]));
      }
      // module references require @specwright/hooks — skip silently

      return {
        matcher: m.matcher,
        timeout: m.timeout,
        hooks,
      };
    });
  }

  return resolved;
}
