/**
 * SQLite schema definition
 * Per AGENT_BRIEF.md section 7: SQLite Committer (v0)
 *
 * 8 tables enforcing invariants:
 * - I0 (Source of Truth): events table is append-only
 * - I1 (Atomic Progress): source_state cursor only advances on COMMIT
 * - I2 (Semantic Identity): event_id PRIMARY KEY prevents duplicates
 */

export const SCHEMA_DDL = `
-- Commit records: atomic unit of work
CREATE TABLE IF NOT EXISTS commits (
  commit_id TEXT PRIMARY KEY,
  commit_key TEXT NOT NULL UNIQUE,
  trace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  old_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commits_source_trace ON commits(source_id, trace_id);

-- Event log: append-only source of truth (I0)
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  candidate_seq INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY (commit_id) REFERENCES commits(commit_id)
);

CREATE INDEX IF NOT EXISTS idx_events_source_item ON events(source_id, source_item_id);
CREATE INDEX IF NOT EXISTS idx_events_trace_seq ON events(trace_id, candidate_seq);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

-- Artifact registry: references to Phase 1 artifact writes
CREATE TABLE IF NOT EXISTS artifacts (
  artifact_key TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (commit_id) REFERENCES commits(commit_id)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_commit ON artifacts(commit_id);

-- Source cursor state (I1: only advanced on COMMIT)
CREATE TABLE IF NOT EXISTS source_state (
  source_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  last_commit_id TEXT NOT NULL,
  last_commit_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (last_commit_id) REFERENCES commits(commit_id)
);

-- Read model 1: Facet index (example derived view)
CREATE TABLE IF NOT EXISTS facet_index (
  facet_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  facet_key TEXT NOT NULL,
  facet_value TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_facet_key ON facet_index(facet_key);

-- Read model 2: Fingerprint index (deduplication reference)
CREATE TABLE IF NOT EXISTS fingerprint_index (
  fingerprint TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  first_event_id TEXT NOT NULL,
  FOREIGN KEY (first_event_id) REFERENCES events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_fingerprint_payload ON fingerprint_index(payload_hash);

-- Read model 3: Hold index (items pending decision)
CREATE TABLE IF NOT EXISTS hold_index (
  hold_id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reason TEXT,
  FOREIGN KEY (event_id) REFERENCES events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_hold_source_item ON hold_index(source_item_id);

-- Read model 4: Curated docs (final persisted items)
CREATE TABLE IF NOT EXISTS curated_docs (
  doc_id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  FOREIGN KEY (last_event_id) REFERENCES events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_curated_source_item ON curated_docs(source_item_id);

-- Project configuration index (D1 stores index, R2 stores full object)
CREATE TABLE IF NOT EXISTS project_configs (
  project_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  project_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_reviewed_at TEXT,
  pinned BOOLEAN NOT NULL DEFAULT 0,
  last_activity_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_configs_active ON project_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_project_configs_updated ON project_configs(updated_at);
CREATE INDEX IF NOT EXISTS idx_project_configs_pinned ON project_configs(pinned);
CREATE INDEX IF NOT EXISTS idx_project_configs_activity ON project_configs(last_activity_at);
`;
