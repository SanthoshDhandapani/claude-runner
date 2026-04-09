# Permissions

Control what tools Claude can use.

## Quick modes

```typescript
// Auto-approve everything (CI, sandboxed environments)
const runner = new Runner({ permissions: 'auto' });

// Deny unknown tools (safe default)
const runner = new Runner({ permissions: 'deny-unknown' });

// Route all to callback
const runner = new Runner({
  permissions: 'prompt',
  onPermission: async ({ tool, description }) => {
    return confirm(`Allow ${tool}? ${description}`);
  },
});
```

## Permission modes

| Mode | Behavior |
|---|---|
| `'auto'` | All tools auto-approved. Uses `bypassPermissions` under the hood. |
| `'deny-unknown'` | Read/Write/Edit/Glob/Grep/Bash/Agent/Skill/ToolSearch + all MCP tools allowed. Everything else denied. |
| `'prompt'` | Everything goes through `onPermission` callback. |
| `PermissionPolicy` | Fine-grained allow/deny/prompt lists. |

## Fine-grained policy

```typescript
const runner = new Runner({
  permissions: {
    allow: ['Read', 'Glob', 'Grep', 'mcp__github__*'],
    deny: ['Bash(rm *)'],
    prompt: ['Bash', 'Write'],
  },
  onPermission: async (req) => {
    console.log(`Tool: ${req.tool}`);
    console.log(`Input: ${JSON.stringify(req.input)}`);
    return confirm('Allow?');
  },
});
```

### Pattern matching

- **Exact match**: `'Read'`, `'Bash'`
- **Wildcards**: `'mcp__github__*'` matches all tools from the github MCP server
- **Match all**: `'*'`

### Evaluation order

1. Check `deny` list — if matched, block immediately
2. Check `allow` list — if matched, approve
3. Check `prompt` list — if matched, route to `onPermission` callback
4. If nothing matches, deny

## PermissionRequest

The `onPermission` callback receives:

```typescript
interface PermissionRequest {
  tool: string;           // Tool name (e.g., "Bash", "mcp__github__create_issue")
  id: string;             // Unique request ID
  description: string;    // Human-readable description
  input?: Record<string, unknown>;  // Tool arguments
}
```

Return `true` to allow, `false` to deny.

## Hooks for advanced policies

For declarative policies that don't require a callback:

```typescript
const runner = new Runner({
  hooks: {
    PreToolUse: [{
      matcher: 'Bash',
      rules: [
        { deny: 'rm -rf', reason: 'Blocked: destructive command' },
        { deny: 'sudo *', reason: 'Blocked: requires elevated privileges' },
        { allow: '*', reason: 'Other bash commands allowed' },
      ],
    }],
  },
});
```

See [API Reference](./api.md) for full hook types.
