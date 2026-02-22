/**
 * Hashing implementation for dual-hash system
 * Per AGENT_BRIEF.md section 3: Canonicalization & Hashing
 *
 * Two hashes per event:
 * 1. event_id: semantic hash (deduplication key, excludes audit-only fields)
 * 2. payload_hash: full payload hash (integrity verification)
 */
/**
 * Computes full payload hash
 * Used for integrity verification and artifact correlation
 */
export declare function payloadHash(payload: unknown): string;
/**
 * Computes semantic event_id hash
 * Formula per AGENT_BRIEF.md:
 * event_id = sha256(canonical_string(event_type + source_item_id + semantic_core(payload)))
 *
 * This hash:
 * - Identifies events uniquely for deduplication (I2)
 * - Excludes audit-only fields (observed_at)
 * - Enables forward-compatible schema changes
 */
export declare function eventId(eventType: string, sourceItemId: string, semanticPayload: unknown): string;
/**
 * Computes deterministic commit key
 * Formula per AGENT_BRIEF.md section 5:
 * commitKey = sha256(canonical_json({
 *   source_id,
 *   old_state,
 *   item_ids_sorted: sort(items.map(i => i.source_item_id)),
 *   hash_alg_commit: "dc-v1-commitkey"
 * }))
 *
 * Ensures:
 * - Same batch regardless of order → same commitKey (idempotency)
 * - Deterministic replay (I3)
 */
export declare function commitKey(sourceId: string, oldState: unknown, itemIds: string[]): string;
//# sourceMappingURL=hashing.d.ts.map