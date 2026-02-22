/**
 * Runner: Core orchestration engine
 * Per AGENT_BRIEF.md section 10: Runner Semantics
 *
 * Pipeline:
 * 1. Fetch: Read batch from source (proposed state only)
 * 2. Stage 1: Emit item_observed events
 * 3. Stage 2: Compare items, emit item_assessed events
 * 4. Stage 3: Decide policy, emit item_decided events
 * 5. Stage 4: Merge duplicates, emit item_merged events
 * 6. Commit: Atomically persist all events
 *
 * Enforces invariants:
 * - I3 (Determinism): Frozen Clock → identical event_ids
 * - I4 (Transparency): Each stage is pure function, no global state
 */
import type { Source, Committer, Comparator, Decider, Merger, Ranker, Clock } from '../interfaces/index.js';
/**
 * Runner class
 */
export declare class Runner {
    private source;
    private committer;
    private comparator;
    private decider;
    private merger?;
    private ranker?;
    private clock?;
    constructor(source: Source, committer: Committer, comparator: Comparator, decider: Decider, merger?: Merger | undefined, ranker?: Ranker | undefined, clock?: Clock | undefined);
    /**
     * Run one batch: fetch → stage → commit
     * Returns commitId or null if no items available
     */
    runBatch(): Promise<{
        commitId: string;
        traceId: string;
    } | null>;
    /**
     * Create event with computed hashes
     */
    private createEvent;
    /**
     * Compute payload hash (SHA256 of canonical JSON)
     */
    private computePayloadHashValue;
    /**
     * Plan mutations based on decisions
     */
    private planMutations;
    /**
     * Get source state from committer
     */
    private getSourceState;
    /**
     * Get base views for comparison
     */
    private getBaseViews;
    /**
     * Generate unique trace ID for batch
     */
    private generateTraceId;
}
//# sourceMappingURL=runner.d.ts.map