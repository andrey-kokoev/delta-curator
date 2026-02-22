/**
 * Core types for Delta-Curator
 * Shared across all packages
 */
/**
 * Event header - metadata about an event
 * Per AGENT_BRIEF.md section 4: Identity & Ordering
 */
export interface EventHeader {
    event_type: string;
    event_version: string;
    event_id: string;
    payload_hash: string;
    hash_alg: 'dc-v1-semcore';
    trace_id: string;
    source_id: string;
    source_item_id: string;
    candidate_seq: number;
    commit_id?: string;
    observed_at: string;
}
/**
 * Complete event with payload
 */
export interface Event<TPayload = unknown> extends EventHeader {
    payload: TPayload;
}
/**
 * Source state - opaque JSON state maintained by source plugin
 */
export type SourceState = Record<string, unknown>;
/**
 * Raw document as observed from source
 */
export interface RawDocObserved {
    source_item_id: string;
    observed_at: string;
    payload: unknown;
}
/**
 * Mutations to apply to read models
 */
export interface ViewMutation {
    view: string;
    operation: 'insert' | 'update' | 'delete';
    key: unknown;
    data?: unknown;
}
/**
 * Artifact reference
 */
export interface ArtifactRef {
    key: string;
    sha256: string;
}
/**
 * Commit request - assembled before calling Committer.commit()
 * All fields are immutable and precomputed
 */
export interface CommitRequest {
    commitKey: string;
    traceId: string;
    sourceId: string;
    oldState: SourceState;
    newState: SourceState;
    events: Event<unknown>[];
    mutations: ViewMutation[];
    artifacts?: Record<string, ArtifactRef>;
}
/**
 * Commit response
 */
export interface CommitResponse {
    commitId: string;
}
/**
 * Candidate document - immutable envelope for an item being processed
 */
export interface CandidateDoc {
    trace_id: string;
    source_item_id: string;
    candidate_seq: number;
    observed_at: string;
    payload: unknown;
}
/**
 * Read model snapshot
 */
export interface BaseView {
    viewName: string;
    state: Record<string, unknown>;
}
/**
 * Result from comparator plugin
 */
export interface ComparisonResult {
    source_item_id: string;
    novelty: 'novel' | 'duplicate' | 'similar';
    confidence: number;
    rationale?: string;
    signals?: {
        rank_score?: number;
        rank_backend?: 'workers_ai_rerank' | 'ai_search_rerank' | 'none';
        rank_model?: string;
    };
}
/**
 * Analysis output from comparator, input to decider
 */
export interface CandidateAnalysis {
    candidate: CandidateDoc;
    comparison: ComparisonResult;
    baseViews: BaseView[];
}
/**
 * Decision from decider plugin
 */
export interface DecisionResult {
    source_item_id: string;
    decision: 'append' | 'merge' | 'hold' | 'reject';
    reason?: string;
    targetId?: string;
}
/**
 * Merge result from merger plugin
 */
export interface MergeResult {
    merged: CandidateDoc;
    artifacts?: Record<string, Buffer>;
}
/**
 * Resolved view snapshot
 */
export interface ResolveView {
    name: string;
    snapshot: unknown;
}
//# sourceMappingURL=types.d.ts.map