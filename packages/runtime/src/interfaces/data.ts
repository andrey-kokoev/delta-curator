/**
 * Data structure interfaces for runner and stages
 */

import type { CandidateDoc, BaseView, ComparisonResult, CandidateAnalysis, DecisionResult } from '@delta-curator/protocol';

// Re-export protocol types for convenience
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
  events: Event<unknown>[]; // Events emitted by this stage
  mutations: ViewMutation[]; // Mutations to apply
}

/**
 * Context available to all stages
 */
export interface StageContext {
  traceId: string; // Batch identifier
  sourceId: string; // Source plugin id
  clock: Clock; // Testable time source
  logger?: Logger; // Optional logging
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
