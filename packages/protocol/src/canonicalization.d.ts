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
export declare function canonicalJson(value: unknown): string;
/**
 * Extracts the semantic core of a payload (required fields only)
 * Excludes audit-only fields like 'observed_at'
 *
 * Used to compute event_id with only semantic content (I2)
 */
export declare function semanticCore(payload: unknown, requiredFields: string[]): unknown;
//# sourceMappingURL=canonicalization.d.ts.map