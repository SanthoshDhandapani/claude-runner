# Sandbox Isolation

Run agents inside Docker containers. The agent can read, write, and execute code — but only within the container.

## Why sandbox?

With `permissions: 'auto'`, Claude executes arbitrary bash commands and writes files. For CI/CD, untrusted workloads, or production pipelines, sandbox isolation limits the blast radius.

## Docker

```typescript
import { Runner } from 'claude-runner';

const runner = new Runner({
  sandbox: 'docker',
  docker: {
    image: 'node:22-slim',
  },
  permissions: 'auto',
});

const result = await runner.run('Install dependencies and run tests');
```

Your `cwd` is bind-mounted into the container at `/workspace`. All tool calls operate on the container filesystem.

### DockerConfig

| Field | Type | Default | Description |
|---|---|---|---|
| `image` | `string` | `"node:22-slim"` | Docker image |
| `mount` | `string[]` | `[]` | Additional host paths (read-only) |
| `network` | `string` | — | Docker network mode |

### Additional mounts

```typescript
const runner = new Runner({
  sandbox: 'docker',
  docker: {
    image: 'node:22-slim',
    mount: ['/shared/test-fixtures', '/shared/config'],
    network: 'host',
  },
});
```

Mounts appear at `/mnt/<dirname>` inside the container (read-only).

### Check Docker availability

```typescript
import { getDockerStatus } from 'claude-runner';

const version = getDockerStatus();
if (version) {
  console.log(`Docker ${version} available`);
} else {
  console.log('Docker not installed or not running');
}
```

## How it works

The Agent SDK calls `spawnClaudeCodeProcess(options)` to start the `claude` CLI. When `sandbox: 'docker'` is set, claude-runner intercepts this and wraps the command in `docker run -i`:

1. Your project `cwd` is bind-mounted at `/workspace`
2. Environment variables are passed to the container
3. stdin/stdout are piped for the stream-json protocol
4. The AbortSignal triggers `SIGTERM` on the container
5. Container is removed automatically on exit (`--rm`)

## Custom spawner

Bring your own container runtime:

```typescript
import { spawn } from 'node:child_process';
import type { SpawnFn } from 'claude-runner';

const mySpawner: SpawnFn = (options) => {
  const proc = spawn('podman', ['run', '--rm', '-i', 'node:22', options.command, ...options.args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  options.signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true });

  return {
    stdin: proc.stdin,
    stdout: proc.stdout,
    get killed() { return proc.killed; },
    get exitCode() { return proc.exitCode; },
    kill: (sig) => proc.kill(sig as NodeJS.Signals),
    on: (event, listener) => proc.on(event, listener),
  };
};

const runner = new Runner({ sandbox: mySpawner });
```

## E2B (coming soon)

Cloud-hosted sandboxes via [E2B](https://e2b.dev):

```typescript
const runner = new Runner({
  sandbox: 'e2b',
  e2b: { apiKey: process.env.E2B_API_KEY },
});
```

## macOS file sharing

Docker on macOS runs in a VM. Only certain directories are shared:

- **Docker Desktop**: `/Users`, `/Volumes`, `/private`, `/tmp`
- **Rancher Desktop**: `$HOME` only (`/tmp` is **not** shared)

Ensure your `cwd` is in a shared directory, or the bind mount will appear empty.

## CI/CD example

```yaml
# GitHub Actions
- name: Run agent in sandbox
  run: |
    node -e "
      import { Runner } from 'claude-runner';
      const runner = new Runner({
        sandbox: 'docker',
        docker: { image: 'node:22-slim' },
        permissions: 'auto',
      });
      const result = await runner.run('Run tests and report results');
      console.log(result.text);
      process.exit(result.error ? 1 : 0);
    "
```
