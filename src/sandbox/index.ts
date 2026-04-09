/**
 * sandbox/index.ts — Sandbox factory.
 *
 * Routes 'e2b' | 'docker' | SpawnFn to the appropriate spawner.
 * E2B and Docker are lazy-loaded to keep them optional.
 */

import { spawn, execSync } from "node:child_process";
import { PassThrough } from "node:stream";
import type { SpawnFn, SpawnedProcess, SpawnOptions, E2bConfig, DockerConfig } from "../types.js";

export function createSpawner(
  sandbox: "local" | "e2b" | "docker" | SpawnFn,
  e2bConfig?: E2bConfig,
  dockerConfig?: DockerConfig
): SpawnFn | undefined {
  if (sandbox === "local") return undefined;
  if (typeof sandbox === "function") return sandbox;

  if (sandbox === "e2b") {
    return createE2bSpawner(e2bConfig ?? {});
  }

  if (sandbox === "docker") {
    return createDockerSpawner(dockerConfig ?? {});
  }

  return undefined;
}

/**
 * Check whether Docker is available.
 * Returns the version string, or null if not installed/running.
 */
export function getDockerStatus(): string | null {
  try {
    return execSync("docker version --format '{{.Server.Version}}'", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim().replace(/'/g, "");
  } catch {
    return null;
  }
}

/**
 * E2B spawner — runs the Agent SDK's subprocess inside an E2B cloud sandbox.
 *
 * How it works:
 * The Agent SDK calls spawnClaudeCodeProcess(options) to start `claude`.
 * We intercept this, create an E2B sandbox, start the command as a background
 * process, and bridge E2B's callback-based I/O to Node.js streams.
 *
 * Requires: `npm install e2b` (optional peer dependency)
 */
function createE2bSpawner(config: E2bConfig): SpawnFn {
  return (options: SpawnOptions): SpawnedProcess => {
    // Stdin/stdout bridges — PassThrough streams that we control
    const stdinStream = new PassThrough();
    const stdoutStream = new PassThrough();

    let killed = false;
    let exitCode: number | null = null;
    const listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

    function emit(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) fn(...args);
    }

    // Boot the sandbox and start the process asynchronously
    (async () => {
      // Lazy-load e2b
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let Sandbox: any;
      try {
        const e2bModule = await import("e2b" as string) as { Sandbox: unknown };
        Sandbox = e2bModule.Sandbox;
      } catch {
        throw new Error(
          "E2B sandbox requires the 'e2b' package. Install it with: npm install e2b"
        );
      }

      // Create sandbox
      const sandboxOpts: Record<string, unknown> = {};
      if (config.timeout) sandboxOpts.timeoutMs = config.timeout;
      if (config.apiKey) sandboxOpts.apiKey = config.apiKey;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sandbox = config.template
        ? await (Sandbox as any).create(config.template, sandboxOpts)
        : await (Sandbox as any).create(sandboxOpts);

      // Upload cwd files if specified
      if (options.cwd) {
        // E2B doesn't bind-mount — set the cwd for the command
        // Files must be uploaded separately if needed
      }

      // Build the command string
      const cmd = [options.command, ...options.args].join(" ");

      // Start the process in background with stdin enabled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (sandbox as any).commands.run(cmd, {
        background: true,
        cwd: options.cwd ?? "/home/user",
        envs: Object.fromEntries(
          Object.entries(options.env).filter(([, v]) => v !== undefined)
        ) as Record<string, string>,
        onStdout: (data: string) => {
          stdoutStream.write(data);
        },
        onStderr: (data: string) => {
          // Route stderr to stdout stream (Agent SDK reads from stdout only)
          stdoutStream.write(data);
        },
      });

      // Pipe stdin to E2B's sendStdin
      stdinStream.on("data", async (chunk: Buffer) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sandbox as any).commands.sendStdin(handle.pid, chunk.toString());
        } catch {
          // Sandbox may be dead
        }
      });

      stdinStream.on("end", async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sandbox as any).commands.closeStdin(handle.pid);
        } catch {
          // ignore
        }
      });

      // Wire abort signal
      options.signal.addEventListener("abort", async () => {
        killed = true;
        try {
          await handle.kill();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sandbox as any).kill();
        } catch {
          // ignore
        }
        stdoutStream.end();
        emit("exit", 137, null);
      }, { once: true });

      // Wait for process to finish
      try {
        const result = await handle.wait();
        exitCode = result.exitCode;
        stdoutStream.end();
        emit("exit", exitCode, null);
      } catch (err) {
        stdoutStream.end();
        emit("error", err);
        emit("exit", 1, null);
      } finally {
        // Clean up sandbox
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sandbox as any).kill();
        } catch {
          // ignore
        }
      }
    })().catch((err) => {
      stdoutStream.end();
      emit("error", err);
      emit("exit", 1, null);
    });

    return {
      stdin: stdinStream,
      stdout: stdoutStream,
      get killed() { return killed; },
      get exitCode() { return exitCode; },
      kill(_signal?: string) {
        killed = true;
        return true;
      },
      on(event: string, listener: (...args: unknown[]) => void) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(listener);
      },
      once(event: string, listener: (...args: unknown[]) => void) {
        const wrapper = (...args: unknown[]) => {
          const arr = listeners.get(event);
          if (arr) {
            const idx = arr.indexOf(wrapper);
            if (idx >= 0) arr.splice(idx, 1);
          }
          listener(...args);
        };
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(wrapper);
      },
      off(event: string, listener: (...args: unknown[]) => void) {
        const arr = listeners.get(event);
        if (arr) {
          const idx = arr.indexOf(listener);
          if (idx >= 0) arr.splice(idx, 1);
        }
      },
    } as SpawnedProcess;
  };
}

/**
 * Docker spawner — runs the Agent SDK's subprocess inside a Docker container.
 *
 * How it works:
 * The Agent SDK calls spawnClaudeCodeProcess(options) to start `claude` as a subprocess.
 * We intercept this and instead run `docker run -i` with the command inside the container.
 * The project cwd is bind-mounted at /workspace. stdin/stdout are piped for stream-json.
 */
function createDockerSpawner(config: DockerConfig): SpawnFn {
  const image = config.image ?? "node:22-slim";
  const mounts = config.mount ?? [];
  const network = config.network;

  return (options: SpawnOptions): SpawnedProcess => {
    const dockerArgs: string[] = [
      "run",
      "--rm",
      "-i",                        // interactive — pipe stdin/stdout
      "-w", "/workspace",
    ];

    // Bind-mount the working directory
    if (options.cwd) {
      dockerArgs.push("-v", `${options.cwd}:/workspace`);
    }

    // Additional read-only mounts
    for (const mount of mounts) {
      const name = mount.split("/").pop() ?? "vol";
      dockerArgs.push("-v", `${mount}:/mnt/${name}:ro`);
    }

    // Pass environment variables
    for (const [key, val] of Object.entries(options.env)) {
      if (val !== undefined) {
        dockerArgs.push("-e", `${key}=${val}`);
      }
    }

    // Network mode
    if (network) {
      dockerArgs.push("--network", network);
    }

    // Image + the actual command
    dockerArgs.push(image, options.command, ...options.args);

    const proc = spawn("docker", dockerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wire abort signal
    options.signal.addEventListener("abort", () => {
      proc.kill("SIGTERM");
    }, { once: true });

    // Adapt to SpawnedProcess interface
    return {
      stdin: proc.stdin!,
      stdout: proc.stdout!,
      get killed() { return proc.killed; },
      get exitCode() { return proc.exitCode; },
      kill(signal?: string) { return proc.kill((signal ?? "SIGTERM") as NodeJS.Signals); },
      on(event: string, listener: (...args: unknown[]) => void) {
        proc.on(event, listener);
      },
      once(event: string, listener: (...args: unknown[]) => void) {
        proc.once(event, listener);
      },
      off(event: string, listener: (...args: unknown[]) => void) {
        proc.off(event, listener);
      },
    } as SpawnedProcess;
  };
}
