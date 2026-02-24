/**
 * Project Configuration Schema and Types
 * Stores project config objects in D1 (index) + R2 (object)
 */

import { z } from 'zod';

/**
 * Plugin reference schema - references a plugin by id with optional config
 */
export const PluginRefSchema = z.object({
  plugin: z.string().min(1, 'Plugin id is required'),
  config: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Source configuration schema
 */
export const SourceConfigSchema = z.object({
  id: z.string().min(1, 'Source id is required'),
  plugin: z.string().min(1, 'Plugin id is required'),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Ingest ranker configuration schema
 */
export const IngestRankerSchema = z.object({
  enabled: z.boolean().default(false),
  backend: z.enum(['none', 'workers_ai_rerank']).default('none'),
  model: z.string().optional(),
  query: z.string().optional(),
  max_passage_chars: z.number().int().min(256).max(12000).default(4000),
});

/**
 * Search ranker configuration schema
 */
export const SearchRankerSchema = z.object({
  enabled: z.boolean().default(false),
  backend: z.enum(['none', 'ai_search_rerank']).default('none'),
  index: z.string().optional(),
  rerank: z.boolean().default(true),
});

/**
 * Ranking configuration schema
 */
export const RankingConfigSchema = z.object({
  ingest: IngestRankerSchema,
  search: SearchRankerSchema,
});

/**
 * Pipeline stage configuration schema
 */
export const PipelineConfigSchema = z.object({
  normalizer: PluginRefSchema,
  extractor: PluginRefSchema,
  resolver: PluginRefSchema,
  comparator: PluginRefSchema,
  ranking: RankingConfigSchema,
  decider: PluginRefSchema,
  merger: PluginRefSchema,
});

/**
 * Topic configuration schema
 */
export const TopicConfigSchema = z.object({
  id: z.string().min(1, 'Topic id is required'),
  label: z.string().min(1, 'Topic label is required'),
});

/**
 * Storage configuration schema
 */
export const StorageConfigSchema = z.object({
  committer: z.object({
    plugin: z.literal('d1_committer').default('d1_committer'),
    config: z.object({
      database: z.string().min(1, 'Database binding name is required'),
    }),
  }),
  artifacts: z.object({
    kind: z.literal('r2').default('r2'),
    bucket: z.string().min(1, 'Bucket binding name is required'),
    prefix: z.string().default('delta-curator/'),
  }),
});

/**
 * Runtime configuration schema
 */
export const RuntimeConfigSchema = z.object({
  max_items_per_batch: z.number().int().min(1).max(5000).default(50),
  clock: z.object({
    mode: z.enum(['system', 'fixed']).default('system'),
    fixed_iso: z.string().optional(),
  }).default({ mode: 'system' }),
});

/**
 * Schedule configuration schema
 */
export const ScheduleConfigSchema = z.object({
  enabled: z.boolean().default(false),
  sources: z.array(
    z.object({
      source_id: z.string().min(1),
      max_items: z.number().int().min(1).max(5000).default(50),
    })
  ).default([]),
});

/**
 * Main Project Config Schema
 * Versioned configuration for a delta-curator project
 */
export const ProjectConfigSchema = z.object({
  // Schema version for format compatibility
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver format').default('1.0.0'),
  
  // Project identification
  project_id: z.string().min(1, 'Project id is required'),
  project_name: z.string().min(1, 'Project name is required'),
  
  // Topic being monitored
  topic: TopicConfigSchema,
  
  // Data sources
  sources: z.array(SourceConfigSchema).min(1, 'At least one source is required'),
  
  // Processing pipeline
  pipeline: PipelineConfigSchema,
  
  // Storage configuration
  storage: StorageConfigSchema,
  
  // Runtime settings (optional with defaults)
  runtime: RuntimeConfigSchema.optional(),
  
  // Scheduled execution (optional with defaults)
  schedules: ScheduleConfigSchema.optional(),
  
  // Metadata
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

/**
 * Inferred TypeScript types from schemas
 */
export type PluginRef = z.infer<typeof PluginRefSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export type IngestRanker = z.infer<typeof IngestRankerSchema>;
export type SearchRanker = z.infer<typeof SearchRankerSchema>;
export type RankingConfig = z.infer<typeof RankingConfigSchema>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type TopicConfig = z.infer<typeof TopicConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/**
 * D1 index record for project config
 * Stored in D1 for querying/listing
 */
export interface ProjectConfigIndex {
  project_id: string;
  version: string;
  project_name: string;
  is_active: boolean;
  r2_key: string;
  hash: string;
  created_at: string;
  updated_at: string;
}

/**
 * Validation result
 */
export interface ConfigValidationResult {
  success: boolean;
  data?: ProjectConfig;
  errors?: z.ZodError;
}

/**
 * Validate a project config object against the schema
 */
export function validateProjectConfig(config: unknown): ConfigValidationResult {
  const result = ProjectConfigSchema.safeParse(config);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * Parse and validate with default values applied
 */
export function parseProjectConfig(config: unknown): ProjectConfig {
  return ProjectConfigSchema.parse(config);
}
