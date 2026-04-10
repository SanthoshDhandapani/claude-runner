/**
 * api-runner.ts — Anthropic Messages API runner.
 *
 * Uses @anthropic-ai/sdk directly instead of the Claude Agent SDK.
 * No CLI needed — just an API key. Deploys anywhere.
 *
 * Implements an agentic tool loop:
 *   1. Send messages to Claude
 *   2. If Claude requests tool_use → execute tool → send tool_result
 *   3. Repeat until stop_reason is "end_turn" or max turns reached
 */

import type { RunnerOptions, RunResult, RunEvent, ToolResult } from "./types.js";
import { resolveModel } from "./models.js";
import { RunStream } from "./stream.js";
import { isRunnerTool } from "./tools.js";

interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ToolHandler {
  name: string;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export class ApiRunner {
  private options: RunnerOptions;
  private abortCtrl: AbortController | null = null;

  constructor(options: RunnerOptions) {
    this.options = options;
  }

  async startQuery(
    prompt: string,
    runStream: RunStream
  ): Promise<void> {
    const opts = this.options;
    this.abortCtrl = new AbortController();

    // Lazy-load the Anthropic SDK (optional peer dep)
    let Anthropic: new (opts: { apiKey: string }) => AnthropicClient;
    try {
      const mod = await import("@anthropic-ai/sdk" as string) as { default: typeof Anthropic };
      Anthropic = mod.default;
    } catch {
      throw new Error(
        "API Mode requires the '@anthropic-ai/sdk' package. Install it with: npm install @anthropic-ai/sdk"
      );
    }

    const client = new Anthropic({ apiKey: opts.apiKey! });
    const model = resolveModel(opts.model) ?? "claude-sonnet-4-6";
    const maxTurns = opts.maxTurns ?? 50;

    // Build tool specs + handlers from defineTool() tools
    const toolSpecs: ToolSpec[] = [];
    const toolHandlers = new Map<string, ToolHandler>();

    for (const tool of opts.tools ?? []) {
      if (isRunnerTool(tool)) {
        toolSpecs.push({
          name: tool.name,
          description: tool.description,
          input_schema: {
            type: "object",
            properties: tool.schema,
          },
        });
        toolHandlers.set(tool.name, { name: tool.name, handler: tool.handler });
      }
    }

    // Build messages
    const messages: Message[] = [{ role: "user", content: prompt }];

    // System prompt
    const systemPrompt = typeof opts.systemPrompt === "string"
      ? opts.systemPrompt
      : undefined;

    // Track metrics
    const startMs = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let turns = 0;
    let fullText = "";
    const toolCalls: Array<{ tool: string; id: string; duration: number }> = [];
    let sessionId = `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Emit session init
    runStream._push({
      type: "session_init",
      sessionId,
      model,
      tools: toolSpecs.map((t) => t.name),
    });

    // Agentic loop
    for (let turn = 0; turn < maxTurns; turn++) {
      if (this.abortCtrl.signal.aborted) break;
      turns++;

      // Check budget
      if (opts.maxBudget && totalCost >= opts.maxBudget) {
        runStream._push({
          type: "error",
          message: `Budget exceeded: $${totalCost.toFixed(4)} >= $${opts.maxBudget}`,
        });
        break;
      }

      // Call the Messages API with streaming
      const requestParams: Record<string, unknown> = {
        model,
        max_tokens: 8192,
        messages,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        ...(toolSpecs.length > 0 ? { tools: toolSpecs } : {}),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = (client as any).messages.stream(requestParams);

      let assistantContent: ContentBlock[] = [];
      let stopReason = "";

      // Stream events
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream.on("text", (text: string) => {
        fullText += text;
        runStream._push({ type: "text", text });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream.on("contentBlock", (block: any) => {
        if (block.type === "tool_use") {
          runStream._push({
            type: "tool_start",
            tool: block.name,
            id: block.id,
            input: block.input,
          });
        }
        assistantContent.push(block);
      });

      // Wait for completion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalMessage = await (stream as any).finalMessage();
      stopReason = finalMessage.stop_reason;
      assistantContent = finalMessage.content;

      // Track usage
      if (finalMessage.usage) {
        totalInputTokens += finalMessage.usage.input_tokens ?? 0;
        totalOutputTokens += finalMessage.usage.output_tokens ?? 0;
      }

      // Add assistant message to history
      messages.push({ role: "assistant", content: assistantContent });

      // If no tool calls, we're done
      if (stopReason !== "tool_use") break;

      // Execute tool calls
      const toolResults: ContentBlock[] = [];

      for (const block of assistantContent) {
        if (block.type !== "tool_use") continue;

        const toolName = block.name!;
        const toolId = block.id!;
        const toolInput = block.input ?? {};
        const toolStartMs = Date.now();

        const handler = toolHandlers.get(toolName);
        if (!handler) {
          // Unknown tool — return error
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolId,
            content: `Error: Unknown tool '${toolName}'. Available tools: ${[...toolHandlers.keys()].join(", ")}`,
          });
          runStream._push({
            type: "tool_end",
            tool: toolName,
            id: toolId,
            duration: Date.now() - toolStartMs,
          });
          continue;
        }

        // Execute the tool
        try {
          const result = await handler.handler(toolInput as Record<string, unknown>);
          const resultText = result.content
            .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
            .join("\n");

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolId,
            content: resultText,
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolId,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }

        const elapsed = Date.now() - toolStartMs;
        toolCalls.push({ tool: toolName, id: toolId, duration: elapsed });
        runStream._push({
          type: "tool_end",
          tool: toolName,
          id: toolId,
          duration: elapsed,
        });
      }

      // Send tool results back
      messages.push({ role: "user", content: toolResults });
    }

    // Estimate cost (approximate, based on public pricing)
    totalCost = estimateCost(model, totalInputTokens, totalOutputTokens);

    // Build final result
    const result: RunResult = {
      text: fullText,
      sessionId,
      cost: totalCost,
      duration: Date.now() - startMs,
      usage: { input: totalInputTokens, output: totalOutputTokens },
      turns,
      toolCalls,
    };

    runStream._push({ type: "done", result });
  }

  abort(): void {
    this.abortCtrl?.abort();
  }
}

// Approximate cost estimation based on public pricing
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Pricing per million tokens (as of 2026)
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-opus-4-6": { input: 15, output: 75 },
    "claude-opus-4-5-20250918": { input: 15, output: 75 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-sonnet-4-5-20250514": { input: 3, output: 15 },
    "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  };

  const price = pricing[model] ?? { input: 3, output: 15 }; // default to sonnet pricing
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// Minimal Anthropic client type
interface AnthropicClient {
  messages: {
    stream: (params: Record<string, unknown>) => unknown;
    create: (params: Record<string, unknown>) => Promise<unknown>;
  };
}
