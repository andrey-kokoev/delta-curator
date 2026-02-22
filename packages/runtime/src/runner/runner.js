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
import { randomUUID } from 'crypto';
import { eventId, commitKey as computeCommitKey, extractSemanticCoreForEvent, payloadHash } from '@delta-curator/protocol';
/**
 * Runner class
 */
export class Runner {
    constructor(source, committer, comparator, decider, merger, ranker, clock) {
        this.source = source;
        this.committer = committer;
        this.comparator = comparator;
        this.decider = decider;
        this.merger = merger;
        this.ranker = ranker;
        this.clock = clock;
        this.clock = clock || { now: () => new Date() };
    }
    /**
     * Run one batch: fetch → stage → commit
     * Returns commitId or null if no items available
     */
    async runBatch() {
        // Step 1: Get source state
        const sourceState = await this.getSourceState();
        const traceId = this.generateTraceId();
        // Step 2: Read batch from source (proposed state only)
        const batchResult = await this.source.readBatch(sourceState, 100);
        if (!batchResult) {
            return null; // No items available
        }
        const { items, newState: proposedState } = batchResult;
        // Step 3: Emit item_observed events
        const observedEvents = items.map((item, idx) => this.createEvent('item_observed', item.source_item_id, {
            source_item_id: item.source_item_id,
            payload: item.payload
        }, item, traceId, idx));
        // Step 4: Create candidate docs for comparison
        const candidates = observedEvents.map((e) => ({
            trace_id: e.trace_id,
            source_item_id: e.source_item_id,
            candidate_seq: 1,
            observed_at: e.observed_at,
            payload: e.payload
        }));
        // Step 5: Fetch base views (read-only snapshots)
        const baseViews = await this.getBaseViews();
        // Step 6: Comparator stage - compare each item
        const assessedEvents = [];
        const comparisons = [];
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const comparison = await this.comparator.compare(candidate, baseViews);
            comparisons.push(comparison);
            assessedEvents.push(this.createEvent('item_assessed', candidate.source_item_id, {
                source_item_id: candidate.source_item_id,
                novelty: comparison.novelty,
                confidence: comparison.confidence,
                rationale: comparison.rationale
            }, { observed_at: candidate.observed_at }, traceId, i));
        }
        // Step 6b: Ranking (optional, per AGENT_BRIEF2.md)
        if (this.ranker) {
            const passages = candidates.map(c => ({
                id: c.source_item_id,
                text: typeof c.payload === 'object' ?
                    JSON.stringify(c.payload).slice(0, 4000) :
                    String(c.payload).slice(0, 4000)
            }));
            const scores = await this.ranker.score(passages);
            const scoreMap = new Map(scores.map(s => [s.id, s.score]));
            for (const comp of comparisons) {
                comp.signals = {
                    rank_score: scoreMap.get(comp.source_item_id),
                    rank_backend: 'workers_ai_rerank',
                    rank_model: undefined
                };
            }
        }
        // Step 7: Decider stage - decide policy
        const decidedEvents = [];
        const decisions = [];
        for (let i = 0; i < candidates.length; i++) {
            const decision = await this.decider.decide({
                candidate: candidates[i],
                comparison: comparisons[i],
                baseViews
            });
            decisions.push(decision);
            decidedEvents.push(this.createEvent('item_decided', decision.source_item_id, {
                source_item_id: decision.source_item_id,
                decision: decision.decision,
                reason: decision.reason,
                targetId: decision.targetId
            }, { observed_at: candidates[i].observed_at }, traceId, i));
        }
        // Step 8: Merger stage (optional)
        const mergedEvents = [];
        // (Merger logic would go here if merger is provided)
        // Step 9: Plan mutations (read model updates)
        const mutations = this.planMutations(decisions, candidates);
        // Step 10: Compute commit key
        const itemIds = items.map((i) => i.source_item_id).sort();
        const commitKeyValue = computeCommitKey(this.source.id, sourceState, itemIds);
        // Step 11: Assemble all events
        const allEvents = [...observedEvents, ...assessedEvents, ...decidedEvents, ...mergedEvents];
        // Step 12: Create commit request
        const commitRequest = {
            commitKey: commitKeyValue,
            traceId,
            sourceId: this.source.id,
            oldState: sourceState,
            newState: proposedState,
            events: allEvents,
            mutations
        };
        // Step 13: Commit atomically
        const { commitId } = await this.committer.commit(commitRequest);
        // Step 14: Acknowledge batch (optional)
        await this.source.acknowledge?.(traceId);
        return { commitId, traceId };
    }
    /**
     * Create event with computed hashes
     */
    createEvent(eventType, sourceItemId, semanticPayload, fullPayload, traceId, candidateSeq) {
        const semanticCore = extractSemanticCoreForEvent(eventType, semanticPayload);
        const eventIdValue = eventId(eventType, sourceItemId, semanticCore);
        const payloadHashValue = this.computePayloadHashValue(fullPayload);
        const now = this.clock.now();
        const header = {
            event_type: eventType,
            event_version: '1.0',
            event_id: eventIdValue,
            payload_hash: payloadHashValue,
            hash_alg: 'dc-v1-semcore',
            trace_id: traceId,
            source_id: this.source.id,
            source_item_id: sourceItemId,
            candidate_seq: candidateSeq,
            observed_at: now.toISOString()
        };
        return {
            ...header,
            payload: fullPayload
        };
    }
    /**
     * Compute payload hash (SHA256 of canonical JSON)
     */
    computePayloadHashValue(payloadData) {
        return payloadHash(payloadData);
    }
    /**
     * Plan mutations based on decisions
     */
    planMutations(decisions, candidates) {
        const mutations = [];
        for (let i = 0; i < decisions.length; i++) {
            const decision = decisions[i];
            const candidate = candidates[i];
            if (decision.decision === 'append') {
                mutations.push({
                    view: 'curated_docs',
                    operation: 'insert',
                    key: candidate.source_item_id,
                    data: {
                        source_item_id: candidate.source_item_id,
                        payload: candidate.payload,
                        last_event_id: candidate.source_item_id
                    }
                });
            }
            else if (decision.decision === 'hold') {
                mutations.push({
                    view: 'hold_index',
                    operation: 'insert',
                    key: `hold_${candidate.source_item_id}`,
                    data: {
                        source_item_id: candidate.source_item_id,
                        event_id: candidate.source_item_id,
                        reason: decision.reason
                    }
                });
            }
        }
        return mutations;
    }
    /**
     * Get source state from committer
     */
    async getSourceState() {
        try {
            const rows = ((await this.committer.getReadModelState?.('source_state')) ?? []);
            const row = rows.find((r) => r.source_id === this.source.id);
            return row ? JSON.parse(row.state) : {};
        }
        catch {
            return {};
        }
    }
    /**
     * Get base views for comparison
     */
    async getBaseViews() {
        const viewNames = ['fingerprint_index', 'curated_docs', 'hold_index'];
        const views = [];
        for (const name of viewNames) {
            try {
                const rows = (await this.committer.getReadModelState?.(name)) ?? [];
                views.push({ viewName: name, state: rows });
            }
            catch {
                // View may not exist yet
            }
        }
        return views;
    }
    /**
     * Generate unique trace ID for batch
     */
    generateTraceId() {
        return randomUUID();
    }
}
//# sourceMappingURL=runner.js.map