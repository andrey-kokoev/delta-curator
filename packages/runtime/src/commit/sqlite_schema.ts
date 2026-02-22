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
  old_state TEXT NOT NULL,          -- JSON canonical form
  new_state TEXT NOT NULL,          -- JSON canonical form
  created_at TEXT NOT NULL,         -- ISO 8601
  INDEX idx_source_trace (source_id, trace_id)
);

-- Event log: append-only source of truth (I0)
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,        -- Semantic hash (I2: deduplication)
  commit_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,       -- Full payload integrity
  trace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  candidate_seq INTEGER NOT NULL,   -- Ordering within stage
  observed_at TEXT NOT NULL,        -- ISO 8601 (audit only)
  payload TEXT NOT NULL,            -- JSON canonical form
  FOREIGN KEY (commit_id) REFERENCES commits(commit_id),
  INDEX idx_source_item (source_id, source_item_id),
  INDEX idx_trace_seq (trace_id, candidate_seq),
  INDEX idx_event_type (event_type)
);

-- Artifact registry: references to Phase 1 artifact writes
CREATE TABLE IF NOT EXISTS artifacts (
  artifact_key TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sha256 TEXT NOT NULL,             -- Integrity verification
  created_at TEXT NOT NULL,         -- ISO 8601
  FOREIGN KEY (commit_id) REFERENCES commits(commit_id),
  INDEX idx_commit (commit_id)
);

-- Source cursor state (I1: only advanced on COMMIT)
CREATE TABLE IF NOT EXISTS source_state (
  source_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,              -- JSON canonical form (opaque)
  last_commit_id TEXT NOT NULL,
  last_commit_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,         -- ISO 8601
  FOREIGN KEY (last_commit_id) REFERENCES commits(commit_id)
);

-- Read model 1: Facet index (example derived view)
CREATE TABLE IF NOT EXISTS facet_index (
  facet_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  facet_key TEXT NOT NULL,
  facet_value TEXT NOT NULL,       -- JSON
  FOREIGN KEY (event_id) REFERENCES events(event_id),
  INDEX idx_facet_key (facet_key)
);

-- Read model 2: Fingerprint index (deduplication reference)
CREATE TABLE IF NOT EXISTS fingerprint_index (
  fingerprint TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  first_event_id TEXT NOT NULL,    -- Points to original event
  FOREIGN KEY (first_event_id) REFERENCES events(event_id),
  INDEX idx_payload (payload_hash)
);

-- Read model 3: Hold index (items pending decision)
CREATE TABLE IF NOT EXISTS hold_index (
  hold_id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reason TEXT,                     -- Why item is on hold
  FOREIGN KEY (event_id) REFERENCES events(event_id),
  INDEX idx_source_item (source_item_id)
);

-- Read model 4: Curated docs (final persisted items)
CREATE TABLE IF NOT EXISTS curated_docs (
  doc_id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  payload TEXT NOT NULL,           -- JSON
  last_event_id TEXT NOT NULL,     -- Latest event that touched this doc
  FOREIGN KEY (last_event_id) REFERENCES events(event_id),
  INDEX idx_source_item (source_item_id)
);
`;
