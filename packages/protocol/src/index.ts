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

// Config schemas and types
export {
  ProjectConfigSchema,
  PluginRefSchema,
  SourceConfigSchema,
  IngestRankerSchema,
  SearchRankerSchema,
  RankingConfigSchema,
  PipelineConfigSchema,
  TopicConfigSchema,
  StorageConfigSchema,
  RuntimeConfigSchema,
  ScheduleConfigSchema,
  validateProjectConfig,
  parseProjectConfig,
} from './config.js';
export type {
  ProjectConfig,
  PluginRef,
  SourceConfig,
  IngestRanker,
  SearchRanker,
  RankingConfig,
  PipelineConfig,
  TopicConfig,
  StorageConfig,
  RuntimeConfig,
  ScheduleConfig,
  ProjectConfigIndex,
  ConfigValidationResult,
} from './config.js';
