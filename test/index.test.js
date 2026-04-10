/**
 * claude-runner — Test suite
 *
 * Uses Node.js built-in test runner (node:test). Zero test dependencies.
 * Run: node --test test/index.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ─── Imports ─────────────────────────────────────────────────────────────────

import { resolveModel } from "../dist/models.js";
import { normalizeMcpConfig, buildMcpAllowedTools } from "../dist/mcp.js";
import { buildCanUseTool } from "../dist/permissions.js";
import { defineTool, isRunnerTool } from "../dist/tools.js";
import { MessageQueue } from "../dist/message-queue.js";
import { RunStream } from "../dist/stream.js";
import { Runner, getDockerStatus } from "../dist/index.js";
import { createSpawner } from "../dist/sandbox/index.js";

// ─── Models ──────────────────────────────────────────────────────────────────

describe("resolveModel", () => {
  it("resolves opus shorthand", () => {
    assert.equal(resolveModel("opus"), "claude-opus-4-6");
  });

  it("resolves sonnet shorthand", () => {
    assert.equal(resolveModel("sonnet"), "claude-sonnet-4-6");
  });

  it("resolves haiku shorthand", () => {
    assert.equal(resolveModel("haiku"), "claude-haiku-4-5-20251001");
  });

  it("resolves version-specific shorthands", () => {
    assert.equal(resolveModel("opus-4.5"), "claude-opus-4-5-20250918");
    assert.equal(resolveModel("sonnet-4.5"), "claude-sonnet-4-5-20250514");
    assert.equal(resolveModel("opus-4.6"), "claude-opus-4-6");
    assert.equal(resolveModel("sonnet-4.6"), "claude-sonnet-4-6");
    assert.equal(resolveModel("haiku-4.5"), "claude-haiku-4-5-20251001");
  });

  it("passes through full model IDs", () => {
    assert.equal(resolveModel("claude-opus-4-6"), "claude-opus-4-6");
    assert.equal(resolveModel("claude-sonnet-4-6"), "claude-sonnet-4-6");
  });

  it("is case-insensitive", () => {
    assert.equal(resolveModel("OPUS"), "claude-opus-4-6");
    assert.equal(resolveModel("Sonnet"), "claude-sonnet-4-6");
  });

  it("returns undefined for no input", () => {
    assert.equal(resolveModel(), undefined);
    assert.equal(resolveModel(undefined), undefined);
  });

  it("passes through unknown model strings", () => {
    assert.equal(resolveModel("custom-model-v1"), "custom-model-v1");
  });
});

// ─── MCP ─────────────────────────────────────────────────────────────────────

describe("normalizeMcpConfig", () => {
  it("parses command shorthand strings", () => {
    const result = normalizeMcpConfig({
      github: "npx @modelcontextprotocol/server-github",
    });
    assert.deepEqual(result.github, {
      command: "npx",
      args: ["@modelcontextprotocol/server-github"],
    });
  });

  it("parses command with multiple args", () => {
    const result = normalizeMcpConfig({
      db: "npx @mcp/postgres --host localhost --port 5432",
    });
    assert.deepEqual(result.db, {
      command: "npx",
      args: ["@mcp/postgres", "--host", "localhost", "--port", "5432"],
    });
  });

  it("parses HTTP URL strings", () => {
    const result = normalizeMcpConfig({
      api: "https://api.example.com/mcp",
    });
    assert.deepEqual(result.api, {
      type: "http",
      url: "https://api.example.com/mcp",
    });
  });

  it("parses http:// URL strings", () => {
    const result = normalizeMcpConfig({
      local: "http://localhost:3000/mcp",
    });
    assert.deepEqual(result.local, {
      type: "http",
      url: "http://localhost:3000/mcp",
    });
  });

  it("passes through object configs", () => {
    const config = {
      command: "node",
      args: ["server.js"],
      env: { TOKEN: "abc" },
    };
    const result = normalizeMcpConfig({ custom: config });
    assert.deepEqual(result.custom, config);
  });

  it("handles multiple servers", () => {
    const result = normalizeMcpConfig({
      github: "npx @mcp/github",
      api: "https://example.com/mcp",
      custom: { command: "node", args: ["s.js"] },
    });
    assert.equal(Object.keys(result).length, 3);
    assert.equal(result.github.command, "npx");
    assert.equal(result.api.type, "http");
    assert.equal(result.custom.command, "node");
  });

  it("handles empty input", () => {
    const result = normalizeMcpConfig({});
    assert.deepEqual(result, {});
  });
});

describe("buildMcpAllowedTools", () => {
  it("builds wildcard patterns", () => {
    const result = buildMcpAllowedTools(["github", "postgres"]);
    assert.deepEqual(result, ["mcp__github__*", "mcp__postgres__*"]);
  });

  it("handles empty input", () => {
    assert.deepEqual(buildMcpAllowedTools([]), []);
  });
});

// ─── Permissions ─────────────────────────────────────────────────────────────

describe("buildCanUseTool", () => {
  const opts = { toolUseID: "test-id", description: "test" };

  it("auto mode allows everything", async () => {
    const canUse = buildCanUseTool("auto");
    const result = await canUse("Bash", { command: "rm -rf /" }, opts);
    assert.equal(result.behavior, "allow");
  });

  it("deny-unknown allows safe tools", async () => {
    const canUse = buildCanUseTool("deny-unknown");
    for (const tool of ["Read", "Write", "Edit", "Glob", "Grep", "Agent", "Skill", "ToolSearch"]) {
      const result = await canUse(tool, {}, opts);
      assert.equal(result.behavior, "allow", `${tool} should be allowed`);
    }
  });

  it("deny-unknown allows MCP tools", async () => {
    const canUse = buildCanUseTool("deny-unknown");
    const result = await canUse("mcp__github__list_issues", {}, opts);
    assert.equal(result.behavior, "allow");
  });

  it("deny-unknown denies unknown tools", async () => {
    const canUse = buildCanUseTool("deny-unknown");
    const result = await canUse("Bash", { command: "ls" }, opts);
    assert.equal(result.behavior, "deny");
  });

  it("prompt mode routes to callback", async () => {
    const canUse = buildCanUseTool("prompt", async (req) => {
      return req.tool === "Read";
    });
    const allowed = await canUse("Read", {}, opts);
    assert.equal(allowed.behavior, "allow");
    const denied = await canUse("Bash", {}, opts);
    assert.equal(denied.behavior, "deny");
  });

  it("prompt mode allows when no callback", async () => {
    const canUse = buildCanUseTool("prompt");
    const result = await canUse("Bash", {}, opts);
    assert.equal(result.behavior, "allow");
  });

  it("policy deny takes precedence", async () => {
    const canUse = buildCanUseTool({
      allow: ["*"],
      deny: ["Bash"],
    });
    const result = await canUse("Bash", {}, opts);
    assert.equal(result.behavior, "deny");
  });

  it("policy allow works", async () => {
    const canUse = buildCanUseTool({
      allow: ["Read", "mcp__github__*"],
    });
    const r1 = await canUse("Read", {}, opts);
    assert.equal(r1.behavior, "allow");
    const r2 = await canUse("mcp__github__list_issues", {}, opts);
    assert.equal(r2.behavior, "allow");
  });

  it("policy prompt routes to callback", async () => {
    let prompted = false;
    const canUse = buildCanUseTool(
      { prompt: ["Bash"] },
      async () => { prompted = true; return true; }
    );
    await canUse("Bash", {}, opts);
    assert.equal(prompted, true);
  });

  it("policy denies unmatched tools", async () => {
    const canUse = buildCanUseTool({ allow: ["Read"] });
    const result = await canUse("Write", {}, opts);
    assert.equal(result.behavior, "deny");
  });
});

// ─── Tools ───────────────────────────────────────────────────────────────────

describe("defineTool", () => {
  it("creates a tool definition with marker", () => {
    const tool = defineTool("test", "A test tool", { input: {} }, async () => ({
      content: [{ type: "text", text: "ok" }],
    }));
    assert.equal(tool.__claudeRunnerTool, true);
    assert.equal(tool.name, "test");
    assert.equal(tool.description, "A test tool");
    assert.equal(typeof tool.handler, "function");
  });

  it("handler returns expected result", async () => {
    const tool = defineTool("greet", "Greet", {}, async () => ({
      content: [{ type: "text", text: "hello" }],
    }));
    const result = await tool.handler({});
    assert.deepEqual(result, { content: [{ type: "text", text: "hello" }] });
  });
});

describe("isRunnerTool", () => {
  it("detects claude-runner tools", () => {
    const tool = defineTool("t", "d", {}, async () => ({ content: [] }));
    assert.equal(isRunnerTool(tool), true);
  });

  it("rejects plain objects", () => {
    assert.equal(isRunnerTool({ name: "fake" }), false);
    assert.equal(isRunnerTool(null), false);
    assert.equal(isRunnerTool(undefined), false);
    assert.equal(isRunnerTool("string"), false);
    assert.equal(isRunnerTool(42), false);
  });
});

// ─── MessageQueue ────────────────────────────────────────────────────────────

describe("MessageQueue", () => {
  it("yields pushed messages in order", async () => {
    const q = new MessageQueue();
    q.push("first");
    q.push("second");
    q.close();

    const messages = [];
    for await (const msg of q) {
      messages.push(msg.message.content);
    }
    assert.deepEqual(messages, ["first", "second"]);
  });

  it("blocks until message arrives", async () => {
    const q = new MessageQueue();
    let received = false;

    const consumer = (async () => {
      for await (const msg of q) {
        received = true;
        assert.equal(msg.message.content, "delayed");
        break;
      }
    })();

    // Push after a delay
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(received, false);
    q.push("delayed");
    q.close();
    await consumer;
    assert.equal(received, true);
  });

  it("ignores pushes after close", async () => {
    const q = new MessageQueue();
    q.push("before");
    q.close();
    q.push("after"); // should be ignored

    const messages = [];
    for await (const msg of q) {
      messages.push(msg.message.content);
    }
    assert.deepEqual(messages, ["before"]);
  });

  it("sets correct message format", async () => {
    const q = new MessageQueue();
    q.push("test", "next");
    q.close();

    for await (const msg of q) {
      assert.equal(msg.type, "user");
      assert.equal(msg.message.role, "user");
      assert.equal(msg.message.content, "test");
      assert.equal(msg.parent_tool_use_id, null);
      assert.equal(msg.priority, "next");
    }
  });
});

// ─── RunStream ───────────────────────────────────────────────────────────────

describe("RunStream", () => {
  it("iterates pushed events", async () => {
    const stream = new RunStream();
    stream._push({ type: "text", text: "hello" });
    stream._push({ type: "text", text: " world" });
    stream._end();

    const events = [];
    for await (const event of stream) {
      events.push(event);
    }
    assert.equal(events.length, 2);
    assert.equal(events[0].text, "hello");
    assert.equal(events[1].text, " world");
  });

  it("resolves result on done event", async () => {
    const stream = new RunStream();
    const mockResult = {
      text: "done",
      sessionId: "s1",
      cost: 0.01,
      duration: 100,
      usage: { input: 50, output: 50 },
      turns: 1,
      toolCalls: [],
    };
    stream._push({ type: "done", result: mockResult });
    stream._end();

    const result = await stream.result;
    assert.equal(result.text, "done");
    assert.equal(result.sessionId, "s1");
    assert.equal(result.cost, 0.01);
  });

  it("resolves text promise", async () => {
    const stream = new RunStream();
    stream._push({
      type: "done",
      result: {
        text: "output text",
        sessionId: "s1",
        cost: 0,
        duration: 0,
        usage: { input: 0, output: 0 },
        turns: 0,
        toolCalls: [],
      },
    });
    stream._end();

    const text = await stream.text;
    assert.equal(text, "output text");
  });

  it("tracks sessionId from session_init event", async () => {
    const stream = new RunStream();
    assert.equal(stream.sessionId, null);
    stream._push({ type: "session_init", sessionId: "abc-123", model: "claude-sonnet-4-6", tools: [] });
    assert.equal(stream.sessionId, "abc-123");
    stream._end();
  });

  it("rejects result on error end", async () => {
    const stream = new RunStream();
    // Attach catch handlers before _end to prevent unhandledRejection
    const resultPromise = stream.result.catch((e) => e);
    stream.text.catch(() => {}); // text derives from result — suppress its rejection too
    stream._end(new Error("test error"));

    const err = await resultPromise;
    assert.ok(err instanceof Error);
    assert.equal(err.message, "test error");
  });

  it("wires send to message queue", () => {
    const stream = new RunStream();
    const pushed = [];
    stream._wire({
      abort: () => {},
      interrupt: async () => {},
      messageQueue: { push: (t) => pushed.push(t), close: () => {} },
    });
    stream.send("hello");
    assert.deepEqual(pushed, ["hello"]);
  });

  it("wires abort", () => {
    const stream = new RunStream();
    let aborted = false;
    stream._wire({
      abort: () => { aborted = true; },
      interrupt: async () => {},
      messageQueue: null,
    });
    stream.abort();
    assert.equal(aborted, true);
  });

  it("wires interrupt", async () => {
    const stream = new RunStream();
    let interrupted = false;
    stream._wire({
      abort: () => {},
      interrupt: async () => { interrupted = true; },
      messageQueue: null,
    });
    await stream.interrupt();
    assert.equal(interrupted, true);
  });
});

// ─── Runner (unit) ───────────────────────────────────────────────────────────

describe("Runner", () => {
  it("creates with default options", () => {
    const runner = new Runner();
    assert.equal(runner.lastSessionId, null);
  });

  it("creates with custom options", () => {
    const runner = new Runner({
      model: "opus",
      cwd: "/tmp",
      permissions: "auto",
      maxTurns: 10,
      maxBudget: 5.0,
    });
    assert.equal(runner.lastSessionId, null);
  });

  it("abort does not throw when no active query", () => {
    const runner = new Runner();
    assert.doesNotThrow(() => runner.abort());
  });
});

// ─── API Mode ────────────────────────────────────────────────────────────────

describe("API Mode", () => {
  it("accepts apiKey in RunnerOptions", () => {
    const runner = new Runner({
      apiKey: "sk-test-key",
      model: "sonnet",
    });
    assert.equal(runner.lastSessionId, null);
  });

  it("ApiRunner is exported", async () => {
    const mod = await import("../dist/index.js");
    assert.equal(typeof mod.ApiRunner, "function");
  });

  it("ApiRunner constructor accepts options with apiKey", async () => {
    const { ApiRunner } = await import("../dist/api-runner.js");
    const runner = new ApiRunner({
      apiKey: "sk-test-key",
      model: "sonnet",
    });
    assert.ok(runner);
  });
});

// ─── Sandbox ─────────────────────────────────────────────────────────────────

describe("sandbox", () => {
  describe("createSpawner", () => {
    it("returns undefined for local", () => {
      assert.equal(createSpawner("local"), undefined);
    });

    it("returns the function for custom SpawnFn", () => {
      const fn = () => {};
      assert.equal(createSpawner(fn), fn);
    });

    it("returns a function for docker", () => {
      const spawner = createSpawner("docker", undefined, { image: "node:22-slim" });
      assert.equal(typeof spawner, "function");
    });

    it("returns a function for e2b", () => {
      const spawner = createSpawner("e2b");
      assert.equal(typeof spawner, "function");
    });
  });

  describe("getDockerStatus", () => {
    it("returns a version string or null", () => {
      const status = getDockerStatus();
      if (status !== null) {
        assert.match(status, /^\d+\.\d+/);
      }
    });
  });
});

// ─── Docker Sandbox (integration) ───────────────────────────────────────────

describe("Docker sandbox (integration)", { skip: !getDockerStatus() }, () => {
  const spawner = createSpawner("docker", undefined, { image: "node:22-slim" });
  let testDir;

  before(() => {
    testDir = path.join(process.env.HOME, `.cr-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "hello.js"),
      'console.log(JSON.stringify({ ok: true, cwd: process.cwd(), node: process.version }))'
    );
  });

  it("runs a script inside the container", async () => {
    const { stdout, code } = await spawnAndCollect(spawner, {
      command: "node",
      args: ["/workspace/hello.js"],
      cwd: testDir,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.cwd, "/workspace");
    assert.match(parsed.node, /^v\d+/);
  });

  it("bind-mounts cwd at /workspace", async () => {
    const { stdout } = await spawnAndCollect(spawner, {
      command: "ls",
      args: ["/workspace"],
      cwd: testDir,
    });
    assert.ok(stdout.includes("hello.js"));
  });

  it("writes from container are visible on host", async () => {
    await spawnAndCollect(spawner, {
      command: "sh",
      args: ["-c", "echo sandbox-proof > /workspace/proof.txt"],
      cwd: testDir,
    });
    // Wait for filesystem sync
    await new Promise((r) => setTimeout(r, 500));
    const content = fs.readFileSync(path.join(testDir, "proof.txt"), "utf-8").trim();
    assert.equal(content, "sandbox-proof");
  });

  it("passes environment variables", async () => {
    const { stdout } = await spawnAndCollect(spawner, {
      command: "node",
      args: ["-e", "console.log(process.env.TEST_VAR)"],
      cwd: testDir,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", TEST_VAR: "hello-from-env" },
    });
    assert.equal(stdout, "hello-from-env");
  });

  it("abort signal sends SIGTERM to docker process", async () => {
    const abortCtrl = new AbortController();
    const proc = spawner({
      command: "node",
      args: ["-e", "setTimeout(() => {}, 60000)"],
      cwd: testDir,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
      signal: abortCtrl.signal,
    });

    // Verify the process is running
    assert.equal(proc.killed, false);

    await new Promise((r) => setTimeout(r, 500));
    abortCtrl.abort();

    // The abort signal calls proc.kill("SIGTERM") — verify it was called
    // Docker containers with non-PID-1 processes handle SIGTERM correctly
    // but `docker run --rm -i` may not exit synchronously. Just verify
    // the kill was attempted.
    assert.equal(proc.killed, true);
  });

  // Cleanup
  after(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});

// ─── Exports ─────────────────────────────────────────────────────────────────

describe("package exports", () => {
  it("exports Runner class", async () => {
    const mod = await import("../dist/index.js");
    assert.equal(typeof mod.Runner, "function");
  });

  it("exports RunStream class", async () => {
    const mod = await import("../dist/index.js");
    assert.equal(typeof mod.RunStream, "function");
  });

  it("exports defineTool", async () => {
    const mod = await import("../dist/index.js");
    assert.equal(typeof mod.defineTool, "function");
  });

  it("exports resolveModel", async () => {
    const mod = await import("../dist/index.js");
    assert.equal(typeof mod.resolveModel, "function");
  });

  it("exports getDockerStatus", async () => {
    const mod = await import("../dist/index.js");
    assert.equal(typeof mod.getDockerStatus, "function");
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function spawnAndCollect(spawner, { command, args, cwd, env }) {
  return new Promise((resolve, reject) => {
    const abortCtrl = new AbortController();
    const proc = spawner({
      command,
      args,
      cwd,
      env: env ?? { PATH: "/usr/local/bin:/usr/bin:/bin" },
      signal: abortCtrl.signal,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    if (proc.stderr) proc.stderr.on("data", (d) => (stderr += d));
    proc.on("exit", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    proc.on("error", reject);
  });
}
