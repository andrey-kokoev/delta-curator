/**
 * Fingerprint Comparator Plugin
 * Compares items via payload hashing for duplicate detection
 */
import type { CandidateDoc, BaseView, ComparisonResult } from '@delta-curator/protocol';
import type { Comparator } from '@delta-curator/runtime';
/**
 * FingerprintComparator: Simple hash-based comparison
 * Detects duplicates via SHA256(payload)
 */
export declare class FingerprintComparator implements Comparator {
    id: string;
    version: string;
    description: string;
    /**
     * Compare candidate against base views
     * Uses payload hash for fast duplicate detection
     */
    compare(candidate: CandidateDoc, baseViews: BaseView[]): Promise<ComparisonResult>;
}
//# sourceMappingURL=fingerprint_comparator.d.ts.map