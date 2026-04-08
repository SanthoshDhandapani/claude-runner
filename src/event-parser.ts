/**
 * event-parser.ts — Transforms SDKMessage → RunEvent.
 *
 * The Agent SDK emits 20+ message types with deeply nested structures.
 * We flatten them into 7 simple event types.
 */

import type { RunEvent, RunResult, ToolCallSummary } from "./types.js";

/** State tracker for building RunResult from SDK messages. */
export class EventParser {
  private sessionId: string | null = null;
  private model: string = "";
  private tools: string[] = [];
  private fullText: string = "";
  private toolTimings = new Map<string, { tool: string; startMs: number }>();
  private toolCalls: ToolCallSummary[] = [];

  /** Parse an SDK message into zero or more RunEvents. */
  parse(message: Record<string, unknown>): RunEvent[] {
    const type = message.type as string;
    const events: RunEvent[] = [];

    // Streaming text
    if (type === "stream_event") {
      const event = message.event as Record<string, unknown>;
      const eventType = event?.type as string;

      if (eventType === "content_block_delta") {
        const delta = event.delta as Record<string, unknown>;
        if (delta?.type === "text_delta") {
          const text = (delta.text as string) ?? "";
          if (text) {
            this.fullText += text;
            events.push({ type: "text", text });
          }
        }
      }

      // Tool call started
      if (eventType === "content_block_start") {
        const block = event.content_block as Record<string, unknown>;
        if (block?.type === "tool_use") {
          const id = (block.id as string) ?? "";
          const tool = (block.name as string) ?? "unknown";
          this.toolTimings.set(id, { tool, startMs: Date.now() });
          events.push({ type: "tool_start", tool, id });
        }
      }
    }

    // Complete assistant message (tool_use blocks in content)
    if (type === "assistant") {
      const msg = message.message as Record<string, unknown>;
      const content = (msg?.content as Array<Record<string, unknown>>) ?? [];
      for (const block of content) {
        if (block.type === "text") {
          const text = block.text as string;
          if (text && !this.fullText) {
            this.fullText += text;
            events.push({ type: "text", text });
          }
        }
      }
    }

    // Tool result → tool_end event
    if (type === "user") {
      const msg = message.message as Record<string, unknown>;
      const content = (msg?.content as Array<Record<string, unknown>>) ?? [];
      for (const block of content) {
        if (block.type === "tool_result") {
          const id = (block.tool_use_id as string) ?? "";
          const timing = this.toolTimings.get(id);
          if (timing) {
            const duration = Date.now() - timing.startMs;
            this.toolCalls.push({ tool: timing.tool, id, duration });
            events.push({ type: "tool_end", tool: timing.tool, id, duration });
            this.toolTimings.delete(id);
          }
        }
      }
    }

    // System init
    if (type === "system") {
      const subtype = message.subtype as string;

      if (subtype === "init") {
        this.sessionId = (message.session_id as string) ?? null;
        this.model = (message.model as string) ?? "";
        this.tools = (message.tools as string[]) ?? [];
        events.push({
          type: "session_init",
          sessionId: this.sessionId ?? "",
          model: this.model,
          tools: this.tools,
        });

        // MCP server status
        const mcpServers = (message.mcp_servers as Array<Record<string, unknown>>) ?? [];
        for (const server of mcpServers) {
          const name = server.name as string;
          const status = server.status as string;
          if (status === "connected" || status === "failed" || status === "needs-auth") {
            events.push({
              type: "mcp_status",
              server: name,
              status: status as "connected" | "failed" | "needs-auth",
            });
          }
        }
      }

      // Hook block detection
      if (subtype === "hook_response") {
        const output = (message.output as string) ?? "";
        try {
          const parsed = JSON.parse(output) as Record<string, unknown>;
          if (parsed.decision === "block") {
            const reason = (parsed.reason as string) ?? "Blocked by policy";
            events.push({ type: "error", message: reason, code: "HOOK_BLOCKED" });
          }
        } catch { /* not JSON */ }
      }
    }

    // Result
    if (type === "result") {
      const usage = message.usage as Record<string, unknown> | undefined;
      const result: RunResult = {
        text: this.fullText || ((message.result as string) ?? ""),
        sessionId: this.sessionId ?? ((message.session_id as string) ?? ""),
        cost: (message.total_cost_usd as number) ?? 0,
        duration: (message.duration_ms as number) ?? 0,
        usage: {
          input: (usage?.input_tokens as number) ?? 0,
          output: (usage?.output_tokens as number) ?? 0,
        },
        turns: (message.num_turns as number) ?? 0,
        toolCalls: this.toolCalls,
        error: message.is_error ? (((message.errors as string[] | undefined) ?? []).join("; ") || "Unknown error") : undefined,
        structured: message.structured_output,
      };

      // Fill text from result if streaming didn't capture it
      if (!this.fullText && result.text) {
        this.fullText = result.text;
      }

      this.sessionId = result.sessionId;
      events.push({ type: "done", result });
    }

    return events;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getFullText(): string {
    return this.fullText;
  }
}
