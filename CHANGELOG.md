# Changelog

## 0.3.0 (unreleased)

### Added
- **Docker sandbox** — run agents inside Docker containers with `sandbox: 'docker'`
- **E2B sandbox** — run agents in E2B cloud sandboxes with `sandbox: 'e2b'`
- **`getDockerStatus()`** — check if Docker is available
- **Test suite** — 61 tests using `node:test` (models, MCP, permissions, tools, queue, stream, sandbox)
- **Documentation** — 6 docs pages (getting-started, sandbox, mcp, sessions, permissions, api)
- **Examples** — 3 real-world examples (code-reviewer, test-generator, mcp-github-bot)
- **GitHub Actions CI** — automated build + test on Node 18/20/22

### Changed
- Updated `@anthropic-ai/claude-agent-sdk` to ^0.2.97
- Updated `@types/node` to ^22.15.29
- Updated `typescript` to ^5.9.3

## 0.2.0

### Added
- CLI interface (`npx claude-runner "prompt"`)
- Model shorthands (`opus`, `sonnet`, `haiku`, version-specific)
- `--model`, `--mcp`, `--permissions`, `--resume`, `--json` CLI flags

## 0.1.1

### Fixed
- Package export paths

## 0.1.0

### Added
- Initial release
- `Runner` class with `run()`, `stream()`, `resume()`
- `RunStream` async iterable with `send()`, `interrupt()`, `abort()`
- MCP shorthand config (strings, URLs, objects)
- `defineTool()` for custom in-process tools
- Permission policies (`auto`, `prompt`, `deny-unknown`, policy object)
- Declarative hooks (inline rules, module references, callbacks)
- Subagent definitions
- Sandbox interface (`local`, `e2b`, `docker`, custom `SpawnFn`)
