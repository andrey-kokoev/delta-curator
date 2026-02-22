// Protocol package - canonicalization, hashing, types, schemas

export { canonicalJson, semanticCore } from './canonicalization.js';
export { payloadHash, eventId, commitKey } from './hashing.js';
export type {
  EventHeader,
  Event,
  SourceState,
  RawDocObserved,
  ViewMutation,
  ArtifactRef,
  CommitRequest,
  CommitResponse,
  CandidateDoc,
  BaseView,
  ComparisonResult,
  CandidateAnalysis,
  DecisionResult,
  MergeResult,
  ResolveView
} from './types.js';
export { SCHEMA_REGISTRY, extractSemanticCoreForEvent, getRequiredFields, isAuditOnlyField } from './schemas/index.js';
