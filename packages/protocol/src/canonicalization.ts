/**
 * Canonical JSON implementation (single source of truth for determinism)
 *
 * Per AGENT_BRIEF.md specification:
 * - UTF-8 JSON
 * - Object keys sorted lexicographically
 * - No whitespace
 * - Arrays preserve order
 * - Numbers normalized (no trailing zeros, no +0)
 * - Booleans lowercase
 * - null explicit
 * - No implicit defaults
 */

/**
 * Converts any value to canonical JSON string
 * This is the SINGLE implementation used everywhere for determinism (I3)
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

/**
 * Recursively canonicalizes a value
 */
function canonicalizeValue(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value; // Booleans are already lowercase in JSON
  }

  if (typeof value === 'number') {
    // Normalize numbers: handle +0, trailing zeros, etc.
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot canonicalize non-finite number: ${value}`);
    }

    // Convert -0 to 0
    if (Object.is(value, -0)) {
      return 0;
    }

    // Parse and re-stringify to remove trailing zeros
    // e.g., 1.0 becomes 1, 1.500 becomes 1.5
    const str = String(value);
    const num = Number(str);

    // For integers, return as-is
    if (Number.isInteger(num)) {
      return num;
    }

    // For floats, the JSON.stringify will handle normalization
    return num;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    // Arrays: preserve order, canonicalize elements
    return value.map(item => canonicalizeValue(item));
  }

  if (typeof value === 'object') {
    // Objects: sort keys lexicographically, canonicalize values
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value).sort();

    for (const key of keys) {
      sorted[key] = canonicalizeValue((value as Record<string, unknown>)[key]);
    }

    return sorted;
  }

  // Undefined, functions, symbols, etc. should not reach here in JSON context
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

/**
 * Extracts the semantic core of a payload (required fields only)
 * Excludes audit-only fields like 'observed_at'
 *
 * Used to compute event_id with only semantic content (I2)
 */
export function semanticCore(
  payload: unknown,
  requiredFields: string[]
): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const obj = payload as Record<string, unknown>;
  const core: Record<string, unknown> = {};

  // Include only required fields
  for (const field of requiredFields) {
    if (field in obj) {
      core[field] = obj[field];
    }
  }

  return core;
}
