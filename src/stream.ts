/**
 * stream.ts — RunStream implementation.
 *
 * Wraps the Agent SDK's async generator into a developer-friendly
 * async iterable with .result, .text, .send(), .abort() helpers.
 */

import type { RunEvent, RunResult } from "./types.js";
import type { MessageQueue } from "./message-queue.js";

export class RunStream implements AsyncIterable<RunEvent> {
  private events: RunEvent[] = [];
  private resolve: ((value: IteratorResult<RunEvent>) => void) | null = null;
  private done = false;
  private resultPromiseResolve!: (value: RunResult) => void;
  private resultPromiseReject!: (error: Error) => void;
  private _abortFn: (() => void) | null = null;
  private _interruptFn: (() => Promise<void>) | null = null;
  private _messageQueue: MessageQueue | null = null;
  private _sessionId: string | null = null;

  /** Promise that resolves with the final RunResult. */
  readonly result: Promise<RunResult>;

  /** Promise that resolves with the full text output. */
  readonly text: Promise<string>;

  constructor() {
    this.result = new Promise<RunResult>((resolve, reject) => {
      this.resultPromiseResolve = resolve;
      this.resultPromiseReject = reject;
    });
    this.text = this.result.then((r) => r.text);
  }

  /** @internal Push an event into the stream. */
  _push(event: RunEvent): void {
    if (event.type === "session_init") {
      this._sessionId = event.sessionId;
    }
    if (event.type === "done") {
      this.resultPromiseResolve(event.result);
    }
    if (event.type === "error" && !this.done) {
      // Don't reject result promise for non-fatal errors (hook blocks emit as events)
    }

    if (this.resolve) {
      this.resolve({ value: event, done: false });
      this.resolve = null;
    } else {
      this.events.push(event);
    }
  }

  /** @internal Signal the stream is complete. */
  _end(error?: Error): void {
    this.done = true;
    if (error) {
      this.resultPromiseReject(error);
    }
    if (this.resolve) {
      this.resolve({ value: undefined as unknown as RunEvent, done: true });
      this.resolve = null;
    }
  }

  /** @internal Wire up control functions. */
  _wire(opts: {
    abort: () => void;
    interrupt: () => Promise<void>;
    messageQueue: MessageQueue | null;
  }): void {
    this._abortFn = opts.abort;
    this._interruptFn = opts.interrupt;
    this._messageQueue = opts.messageQueue;
  }

  /** Send a follow-up message into the conversation mid-stream. */
  send(message: string): void {
    this._messageQueue?.push(message);
  }

  /** Interrupt the current turn (Claude stops, awaits new input). */
  async interrupt(): Promise<void> {
    await this._interruptFn?.();
  }

  /** Abort the session completely. */
  abort(): void {
    this._abortFn?.();
  }

  /** Session ID (available after session_init event). */
  get sessionId(): string | null {
    return this._sessionId;
  }

  [Symbol.asyncIterator](): AsyncIterator<RunEvent> {
    return {
      next: (): Promise<IteratorResult<RunEvent>> => {
        if (this.events.length > 0) {
          return Promise.resolve({ value: this.events.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as RunEvent,
            done: true,
          });
        }
        return new Promise<IteratorResult<RunEvent>>((resolve) => {
          this.resolve = resolve;
        });
      },
    };
  }
}
