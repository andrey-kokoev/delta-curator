/**
 * Fingerprint Comparator Plugin
 * Compares items via payload hashing for duplicate detection
 */

import { payloadHash } from '@delta-curator/protocol';
import type { Comparator, CandidateDoc, BaseView, ComparisonResult } from '@delta-curator/protocol';

/**
 * FingerprintComparator: Simple hash-based comparison
 * Detects duplicates via SHA256(payload)
 */
export class FingerprintComparator implements Comparator {
  id = 'fingerprint_comparator';
  version = '0.1.0';
  description = 'Hash-based duplicate detection via payload fingerprinting';

  /**
   * Compare candidate against base views
   * Uses payload hash for fast duplicate detection
   */
  async compare(
    candidate: CandidateDoc,
    baseViews: BaseView[]
  ): Promise<ComparisonResult> {
    // Compute fingerprint of candidate payload
    const candidateFingerprint = payloadHash(candidate.payload);

    // Check against fingerprint_index (if available)
    let isDuplicate = false;
    const fingerprintView = baseViews.find((v) => v.viewName === 'fingerprint_index');

    if (fingerprintView && fingerprintView.state) {
      const fingerprints = fingerprintView.state as any[];
      if (Array.isArray(fingerprints)) {
        isDuplicate = fingerprints.some(
          (f: any) => f.payload_hash === candidateFingerprint
        );
      }
    }

    return {
      source_item_id: candidate.source_item_id,
      novelty: isDuplicate ? 'duplicate' : 'novel',
      confidence: isDuplicate ? 1.0 : 1.0,
      rationale: isDuplicate
        ? `Exact payload match found (fingerprint: ${candidateFingerprint.slice(0, 8)}...)`
        : `Novel item (fingerprint: ${candidateFingerprint.slice(0, 8)}...)`
    };
  }
}
