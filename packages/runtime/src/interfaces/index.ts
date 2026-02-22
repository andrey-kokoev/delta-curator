/**
 * Runtime interfaces - core contracts
 */

export type { PluginMeta, Clock, Source, Committer, Comparator, Decider, Merger, Ranker } from './plugin.js';
export type {
  StageInput,
  StageOutput,
  StageContext,
  Logger,
  CandidateDoc,
  BaseView,
  ComparisonResult,
  CandidateAnalysis,
  DecisionResult,
  Event,
  ViewMutation
} from './data.js';
