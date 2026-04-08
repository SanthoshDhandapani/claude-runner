/**
 * models.ts — Model shorthand resolver.
 *
 * Accepts friendly names like 'sonnet', 'opus', 'haiku'
 * and resolves to the full model ID.
 */

const MODEL_ALIASES: Record<string, string> = {
  // Claude 4.6 (latest)
  "opus": "claude-opus-4-6",
  "opus-4.6": "claude-opus-4-6",
  "sonnet": "claude-sonnet-4-6",
  "sonnet-4.6": "claude-sonnet-4-6",

  // Claude 4.5
  "opus-4.5": "claude-opus-4-5-20250918",
  "sonnet-4.5": "claude-sonnet-4-5-20250514",
  "haiku": "claude-haiku-4-5-20251001",
  "haiku-4.5": "claude-haiku-4-5-20251001",
};

/**
 * Resolve a model shorthand to the full model ID.
 * If already a full ID (e.g., 'claude-sonnet-4-6'), returns as-is.
 */
export function resolveModel(model?: string): string | undefined {
  if (!model) return undefined;
  return MODEL_ALIASES[model.toLowerCase()] ?? model;
}
