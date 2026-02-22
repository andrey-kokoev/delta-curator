/**
 * Hashing implementation for dual-hash system
 * Per AGENT_BRIEF.md section 3: Canonicalization & Hashing
 *
 * Two hashes per event:
 * 1. event_id: semantic hash (deduplication key, excludes audit-only fields)
 * 2. payload_hash: full payload hash (integrity verification)
 */

import { createHash } from 'crypto';
import { canonicalJson, semanticCore } from './canonicalization.js';

/**
 * Computes SHA256 hash of canonical JSON
 */
function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Computes full payload hash
 * Used for integrity verification and artifact correlation
 */
export function payloadHash(payload: unknown): string {
  const canonical = canonicalJson(payload);
  return sha256(canonical);
}

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
export function eventId(
  eventType: string,
  sourceItemId: string,
  semanticPayload: unknown
): string {
  // Concatenate components
  const typeStr = canonicalJson(eventType);
  const itemIdStr = canonicalJson(sourceItemId);
  const payloadStr = canonicalJson(semanticPayload);

  // Combine: type + sourceItemId + semanticPayload
  const combined = typeStr + itemIdStr + payloadStr;

  return sha256(combined);
}

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
export function commitKey(
  sourceId: string,
  oldState: unknown,
  itemIds: string[]
): string {
  const input = {
    source_id: sourceId,
    old_state: oldState,
    item_ids_sorted: itemIds.slice().sort(), // Create new array, sort
    hash_alg_commit: 'dc-v1-commitkey'
  };

  const canonical = canonicalJson(input);
  return sha256(canonical);
}
