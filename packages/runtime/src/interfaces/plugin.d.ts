/**
 * Plugin interfaces - contracts for all extensible components
 * Per AGENT_BRIEF.md section 6: Plugin Contracts
 */
import type { RawDocObserved, SourceState, CommitRequest, CommitResponse, CandidateDoc, BaseView, ComparisonResult, CandidateAnalysis, DecisionResult, MergeResult } from '@delta-curator/protocol';
/**
 * Base metadata for all plugins
 */
export interface PluginMeta {
    id: string;
    version: string;
    description: string;
}
/**
 * Clock interface for testable time (dependency injection)
 * Allows tests to freeze time for deterministic behavior (I3)
 */
export interface Clock {
    now(): Date;
}
/**
 * Source plugin - reads items from external source
 * Per AGENT_BRIEF.md section 6
 */
export interface Source extends PluginMeta {
    /**
     * Reads a batch of items from source
     *
     * @param state - Current source state (opaque JSON)
     * @param maxItems - Maximum items to return
     * @returns { items, newState } or null if no items available
     *
     * CRITICAL: newState is PROPOSED only. Not persisted until commit succeeds (I1).
     * This enables atomicity: if source fails after reading but before commit, state doesn't change.
     */
    readBatch(state: SourceState, maxItems: number): Promise<{
        items: RawDocObserved[];
        newState: SourceState;
    } | null>;
    /**
     * Optional: acknowledge batch after successful commit
     * Called after Committer.commit() succeeds
     */
    acknowledge?(batchId: string): Promise<void>;
}
/**
 * Committer plugin - persists events and manages state
 * Enforces invariants I0 (append-only), I1 (atomic progress), I2 (semantic identity)
 * Per AGENT_BRIEF.md section 7
 */
export interface Committer extends PluginMeta {
    /**
     * Atomically persists commit
     *
     * Transaction semantics:
     * 1. Check idempotency: if commitKey exists, return same commitId
     * 2. Insert commit record
     * 3. Insert events (idempotent by event_id PRIMARY KEY)
     * 4. Apply mutations to read models
     * 5. Update source_state cursor (I1: only here)
     * 6. Record artifacts
     * COMMIT or ROLLBACK
     *
     * @param req - Pre-computed commit request
     * @returns commitId - Unique identifier for this commit
     */
    commit(req: CommitRequest): Promise<CommitResponse>;
    /**
     * Optional: rebuild read models from event log
     * Per AGENT_BRIEF.md section 8
     * - Drops all read model tables
     * - Replays events to re-derive indexes
     * - Read models MUST be rebuildable from events alone (I0)
     */
    rebuildToHead?(): Promise<void>;
    /**
     * Optional: get read model snapshot
     * Used by Runner to fetch BaseViews for comparison
     */
    getReadModelState?(view: string): Promise<unknown>;
}
/**
 * Comparator plugin - evaluates novelty of candidate items
 * Stage 2 in Runner pipeline
 */
export interface Comparator extends PluginMeta {
    /**
     * Compares candidate against base views
     *
     * @param candidate - Item being evaluated
     * @param baseViews - Read-only snapshots (one per view)
     * @returns ComparisonResult with novelty assessment
     *
     * CRITICAL: Must be referentially transparent (I4)
     * - Same candidate + baseViews → identical result
     * - No side effects, no global state reads
     */
    compare(candidate: CandidateDoc, baseViews: BaseView[]): Promise<ComparisonResult>;
}
/**
 * Decider plugin - applies policy decisions
 * Stage 3 in Runner pipeline
 */
export interface Decider extends PluginMeta {
    /**
     * Decides policy for candidate
     *
     * @param analysis - Comparison result and context
     * @returns DecisionResult: append, merge, hold, or reject
     *
     * CRITICAL: Must be referentially transparent (I4)
     * - Same analysis → identical decision
     * - No side effects, no global state reads
     */
    decide(analysis: CandidateAnalysis): Promise<DecisionResult>;
}
/**
 * Merger plugin - merges duplicate items
 * Stage 4 in Runner pipeline (optional)
 */
export interface Merger extends PluginMeta {
    /**
     * Merges candidate into base document
     *
     * @param candidate - Item to merge
     * @param baseDoc - Item to merge into
     * @returns MergeResult with merged document and optional artifacts
     *
     * CRITICAL: Must be referentially transparent (I4)
     * - Same inputs → identical merged result
     * - No side effects, no global state reads
     */
    merge(candidate: CandidateDoc, baseDoc: CandidateDoc): Promise<MergeResult>;
}
/**
 * Ranker plugin - scores passages for ranking
 * Stage 6b in Runner pipeline (optional, per AGENT_BRIEF2.md)
 */
export interface Ranker extends PluginMeta {
    /**
     * Scores passages for ranking
     *
     * @param passages - Array of passages with id and text
     * @returns Array of scores in same order as input
     *
     * CRITICAL: Must be referentially transparent (I4)
     * - Same passages → identical scores
     * - No side effects, no global state reads
     */
    score(passages: {
        id: string;
        text: string;
    }[]): Promise<{
        id: string;
        score: number;
    }[]>;
}
//# sourceMappingURL=plugin.d.ts.map