/**
 * Fingerprint Comparator Plugin
 * Compares items via payload hashing for duplicate detection
 */
import { payloadHash } from '@delta-curator/protocol';
/**
 * FingerprintComparator: Simple hash-based comparison
 * Detects duplicates via SHA256(payload)
 */
export class FingerprintComparator {
    constructor() {
        this.id = 'fingerprint_comparator';
        this.version = '0.1.0';
        this.description = 'Hash-based duplicate detection via payload fingerprinting';
    }
    /**
     * Compare candidate against base views
     * Uses payload hash for fast duplicate detection
     */
    async compare(candidate, baseViews) {
        // Compute fingerprint of candidate payload
        const candidateFingerprint = payloadHash(candidate.payload);
        // Check against fingerprint_index (if available)
        let isDuplicate = false;
        const fingerprintView = baseViews.find((v) => v.viewName === 'fingerprint_index');
        if (fingerprintView && fingerprintView.state) {
            const fingerprints = fingerprintView.state;
            if (Array.isArray(fingerprints)) {
                isDuplicate = fingerprints.some((f) => f.payload_hash === candidateFingerprint);
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
//# sourceMappingURL=fingerprint_comparator.js.map