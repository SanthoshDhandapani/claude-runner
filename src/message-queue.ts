/**
 * message-queue.ts — Async iterable message queue for multi-turn conversations.
 *
 * The Agent SDK accepts an AsyncIterable<SDKUserMessage> for streaming input.
 * This queue blocks on iteration when empty, yielding messages as they arrive.
 */

interface QueuedMessage {
  type: "user";
  message: { role: "user"; content: string };
  parent_tool_use_id: null;
  priority?: "now" | "next";
}

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private resolve: (() => void) | null = null;
  private closed = false;

  push(text: string, priority: "now" | "next" = "now"): void {
    if (this.closed) return;
    this.queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      priority,
    });
    this.resolve?.();
    this.resolve = null;
  }

  close(): void {
    this.closed = true;
    this.resolve?.();
    this.resolve = null;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<QueuedMessage, void> {
    while (!this.closed) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else {
        await new Promise<void>((r) => {
          this.resolve = r;
        });
      }
    }
    // Drain remaining
    while (this.queue.length > 0) {
      yield this.queue.shift()!;
    }
  }
}
