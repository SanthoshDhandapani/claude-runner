/**
 * sandbox/index.ts — Sandbox factory.
 *
 * Routes 'e2b' | 'docker' | SpawnFn to the appropriate spawner.
 * E2B and Docker are lazy-loaded to avoid requiring their packages.
 */

import type { SpawnFn, E2bConfig, DockerConfig } from "../types.js";

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

function createE2bSpawner(_config: E2bConfig): SpawnFn {
  // Lazy-load e2b to keep it an optional peer dependency
  return (() => {
    throw new Error(
      "E2B sandbox support is coming soon. " +
        "Install the 'e2b' package and check https://github.com/SanthoshDhandapani/claude-runner for updates."
    );
  }) as unknown as SpawnFn;
}

function createDockerSpawner(_config: DockerConfig): SpawnFn {
  // Docker spawner — uses child_process.spawn, no npm dep needed
  return (() => {
    throw new Error(
      "Docker sandbox support is coming soon. " +
        "Check https://github.com/SanthoshDhandapani/claude-runner for updates."
    );
  }) as unknown as SpawnFn;
}
