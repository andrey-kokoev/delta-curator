export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  roles: string[]
}

export interface ProjectConfig {
  version: string
  project_id: string
  project_name: string
  topic: {
    id: string
    label: string
  }
  sources: SourceConfig[]
  pipeline: PipelineConfig
  storage: StorageConfig
  runtime?: RuntimeConfig
  schedules?: ScheduleConfig
  created_at?: string
  updated_at?: string
}

export interface SourceConfig {
  id: string
  plugin: string
  config: Record<string, unknown>
  state?: Record<string, unknown>
}

export interface PipelineConfig {
  normalizer: PluginRef
  extractor: PluginRef
  resolver: PluginRef
  comparator: PluginRef
  ranking: RankingConfig
  decider: PluginRef
  merger: PluginRef
}

export interface PluginRef {
  plugin: string
  config?: Record<string, unknown>
}

export interface RankingConfig {
  ingest: {
    enabled: boolean
    backend: 'none' | 'workers_ai_rerank'
    model?: string
    query?: string
    max_passage_chars?: number
  }
  search: {
    enabled: boolean
    backend: 'none' | 'ai_search_rerank'
    index?: string
    rerank?: boolean
  }
}

export interface StorageConfig {
  committer: {
    plugin: string
    config: {
      database: string
    }
  }
  artifacts: {
    kind: 'r2'
    bucket: string
    prefix: string
  }
}

export interface RuntimeConfig {
  max_items_per_batch: number
  clock: {
    mode: 'system' | 'fixed'
    fixed_iso?: string
  }
}

export interface ScheduleConfig {
  enabled: boolean
  sources: Array<{
    source_id: string
    max_items: number
  }>
}

export interface ProjectIndex {
  project_id: string
  version: string
  project_name: string
  is_active: boolean
  r2_key: string
  hash: string
  created_at: string
  updated_at: string
}

export interface CuratedDoc {
  doc_id: string
  source_item_id: string
  payload: string
  last_event_id: string
}

export interface SearchResult {
  query: string
  k: number
  rerank: boolean
  docs: CuratedDoc[]
  total: number
  took_ms: number
}

export interface HealthStatus {
  ok: boolean
  version: string
  last_commit_id?: string
  error?: string
}

export interface RunResult {
  commit_id: string | null
  items_processed: number
  events_written: number
  trace_id?: string
}

export interface InspectSourceCursor {
  source_id: string
  cursor_published_at: string | null
  last_fetch: string | null
  recent_guids_count: number
  updated_at: string
}

export interface InspectResult {
  since: string
  generated_at: string
  sources: InspectSourceCursor[]
  markdown: string
}
