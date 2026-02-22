/**
 * Data structure interfaces for runner and stages
 */
import type { CandidateDoc, BaseView, ComparisonResult, CandidateAnalysis, DecisionResult } from '@delta-curator/protocol';
export type { CandidateDoc, BaseView, ComparisonResult, CandidateAnalysis, DecisionResult };
/**
 * Input to a runner stage
 */
export interface StageInput {
    candidateDocs: CandidateDoc[];
    baseViews: BaseView[];
    context: StageContext;
}
/**
 * Output from a runner stage
 */
export interface StageOutput {
    candidates: CandidateDoc[];
    events: Event<unknown>[];
    mutations: ViewMutation[];
}
/**
 * Context available to all stages
 */
export interface StageContext {
    traceId: string;
    sourceId: string;
    clock: Clock;
    logger?: Logger;
}
/**
 * Clock interface (testable time)
 */
export interface Clock {
    now(): Date;
}
/**
 * Optional logger interface
 */
export interface Logger {
    debug(msg: string, data?: unknown): void;
    info(msg: string, data?: unknown): void;
    warn(msg: string, data?: unknown): void;
    error(msg: string, error?: unknown): void;
}
/**
 * Re-import Event and ViewMutation from protocol for local use
 */
import type { Event, ViewMutation } from '@delta-curator/protocol';
export type { Event, ViewMutation };
//# sourceMappingURL=data.d.ts.map