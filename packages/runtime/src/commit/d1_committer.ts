/**
 * D1-based committer implementation (Cloudflare D1)
 * Enforces invariants I0 (append-only), I1 (atomic progress), I2 (semantic identity)
 * Per AGENT_BRIEF2.md
 */

import { createHash } from 'crypto';
import { canonicalJson } from '@delta-curator/protocol';
import type { CommitRequest, CommitResponse } from '@delta-curator/protocol';
import type { Committer, ViewMutation } from '../interfaces/index.js';
import { SCHEMA_DDL } from './sqlite_schema.js';

/**
 * Deterministic commit ID generation from commit key
 */
function generateCommitId(commitKey: string): string {
  return createHash('sha256').update(commitKey).digest('hex');
}

/**
 * D1Committer: atomic, idempotent persistence via Cloudflare D1
 */
export class D1Committer implements Committer {
  id = 'd1-v0';
  version = '0.1.0';
  description = 'Event-sourced append-only D1 committer with artifact support';

  constructor(private db: D1Database) {}

  /**
   * Initialize database: execute schema DDL
   * D1 does not support multi-statement exec, so we batch all CREATE statements
   */
  async init(): Promise<void> {
    try {
      // Enable foreign keys pragma
      await this.db.exec('PRAGMA foreign_keys = ON');

      // Split schema into individual statements and batch them
      const statements = SCHEMA_DDL.split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => this.db.prepare(s));

      await this.db.batch(statements);
    } catch (err) {
      throw new Error(`Failed to initialize D1 schema: ${err}`);
    }
  }

  /**
   * Atomically persist a commit
   * Returns idempotently: same commitKey → same commitId
   */
  async commit(req: CommitRequest): Promise<CommitResponse> {
    // Step 1: Check idempotency
    const existing = await this.db
      .prepare('SELECT commit_id FROM commits WHERE commit_key = ?')
      .bind(req.commitKey)
      .first<{ commit_id: string }>();

    if (existing) {
      return { commitId: existing.commit_id };
    }

    // Step 2: Generate commit ID
    const commitId = generateCommitId(req.commitKey);

    // Step 3-9: Atomic batch transaction
    const batch: D1PreparedStatement[] = [];

    // Step 4: Insert commit record
    batch.push(
      this.db.prepare(
        `INSERT INTO commits
         (commit_id, commit_key, trace_id, source_id, old_state, new_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        commitId,
        req.commitKey,
        req.traceId,
        req.sourceId,
        canonicalJson(req.oldState),
        canonicalJson(req.newState),
        new Date().toISOString()
      )
    );

    // Step 5: Insert events (idempotent by event_id PRIMARY KEY)
    for (const event of req.events) {
      batch.push(
        this.db.prepare(
          `INSERT OR IGNORE INTO events
           (event_id, commit_id, event_type, event_version, payload_hash,
            trace_id, source_id, source_item_id, candidate_seq, observed_at, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          event.event_id,
          commitId,
          event.event_type,
          event.event_version,
          event.payload_hash,
          event.trace_id,
          event.source_id,
          event.source_item_id,
          event.candidate_seq,
          event.observed_at,
          canonicalJson(event.payload)
        )
      );
    }

    // Step 6: Apply mutations to read models
    for (const mutation of req.mutations) {
      batch.push(...this.getMutationStatements(mutation));
    }

    // Step 7: Update source_state cursor (I1: only here)
    batch.push(
      this.db.prepare(
        `INSERT OR REPLACE INTO source_state
         (source_id, state, last_commit_id, last_commit_key, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        req.sourceId,
        canonicalJson(req.newState),
        commitId,
        req.commitKey,
        new Date().toISOString()
      )
    );

    // Step 8: Record artifacts (if any)
    if (req.artifacts) {
      for (const [name, artifact] of Object.entries(req.artifacts)) {
        batch.push(
          this.db.prepare(
            `INSERT INTO artifacts
             (artifact_key, commit_id, name, sha256, created_at)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(
            artifact.key,
            commitId,
            name,
            artifact.sha256,
            new Date().toISOString()
          )
        );
      }
    }

    // Step 9: Execute batch atomically
    try {
      await this.db.batch(batch);
    } catch (err) {
      throw new Error(`Failed to commit batch: ${err}`);
    }

    return { commitId };
  }

  /**
   * Convert ViewMutation to D1 prepared statements
   */
  private getMutationStatements(mutation: ViewMutation): D1PreparedStatement[] {
    if (mutation.operation === 'insert') {
      if (mutation.view === 'curated_docs') {
        const data = mutation.data as any;
        return [
          this.db.prepare(
            `INSERT OR REPLACE INTO curated_docs
             (doc_id, source_item_id, payload, last_event_id)
             VALUES (?, ?, ?, ?)`
          ).bind(
            mutation.key,
            data?.source_item_id,
            canonicalJson(data?.payload),
            data?.last_event_id
          )
        ];
      } else if (mutation.view === 'hold_index') {
        const data = mutation.data as any;
        return [
          this.db.prepare(
            `INSERT OR IGNORE INTO hold_index
             (hold_id, source_item_id, event_id, reason)
             VALUES (?, ?, ?, ?)`
          ).bind(
            mutation.key,
            data?.source_item_id,
            data?.event_id,
            data?.reason
          )
        ];
      } else if (mutation.view === 'fingerprint_index') {
        const data = mutation.data as any;
        return [
          this.db.prepare(
            `INSERT OR IGNORE INTO fingerprint_index
             (fingerprint, source_item_id, payload_hash, first_event_id)
             VALUES (?, ?, ?, ?)`
          ).bind(
            mutation.key,
            data?.source_item_id,
            data?.payload_hash,
            data?.first_event_id
          )
        ];
      } else if (mutation.view === 'facet_index') {
        const data = mutation.data as any;
        return [
          this.db.prepare(
            `INSERT OR IGNORE INTO facet_index
             (facet_id, event_id, facet_key, facet_value)
             VALUES (?, ?, ?, ?)`
          ).bind(
            mutation.key,
            data?.event_id,
            data?.facet_key,
            data?.facet_value
          )
        ];
      }
    }
    return [];
  }

  /**
   * Rebuild read models from events (I0 guarantee)
   */
  async rebuildToHead(): Promise<void> {
    try {
      // Drop read model tables
      const dropStatements = [
        'DROP TABLE IF EXISTS facet_index',
        'DROP TABLE IF EXISTS fingerprint_index',
        'DROP TABLE IF EXISTS hold_index',
        'DROP TABLE IF EXISTS curated_docs'
      ].map(sql => this.db.prepare(sql));

      // Recreate tables (inline from schema)
      const createStatements = [
        this.db.prepare(`
          CREATE TABLE IF NOT EXISTS facet_index (
            facet_id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            facet_key TEXT NOT NULL,
            facet_value TEXT NOT NULL,
            FOREIGN KEY (event_id) REFERENCES events(event_id)
          )
        `),
        this.db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_facet_key ON facet_index(facet_key)
        `),
        this.db.prepare(`
          CREATE TABLE IF NOT EXISTS fingerprint_index (
            fingerprint TEXT PRIMARY KEY,
            source_item_id TEXT NOT NULL,
            payload_hash TEXT NOT NULL,
            first_event_id TEXT NOT NULL,
            FOREIGN KEY (first_event_id) REFERENCES events(event_id)
          )
        `),
        this.db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_fingerprint_payload ON fingerprint_index(payload_hash)
        `),
        this.db.prepare(`
          CREATE TABLE IF NOT EXISTS hold_index (
            hold_id TEXT PRIMARY KEY,
            source_item_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            reason TEXT,
            FOREIGN KEY (event_id) REFERENCES events(event_id)
          )
        `),
        this.db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_hold_source_item ON hold_index(source_item_id)
        `),
        this.db.prepare(`
          CREATE TABLE IF NOT EXISTS curated_docs (
            doc_id TEXT PRIMARY KEY,
            source_item_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            last_event_id TEXT NOT NULL,
            FOREIGN KEY (last_event_id) REFERENCES events(event_id)
          )
        `),
        this.db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_curated_source_item ON curated_docs(source_item_id)
        `)
      ];

      // Execute all drops and creates in batch
      await this.db.batch([...dropStatements, ...createStatements]);

      // Replay events: derive read models
      const events = await this.db
        .prepare('SELECT * FROM events ORDER BY rowid')
        .all<any>();

      if (!events.results) return;

      const replayStatements: D1PreparedStatement[] = [];
      for (const event of events.results) {
        // Replay item_decided events with decision === 'append'
        if (event.event_type === 'item_decided') {
          const payload = JSON.parse(event.payload);
          if (payload.decision === 'append') {
            replayStatements.push(
              this.db.prepare(
                `INSERT OR REPLACE INTO curated_docs
                 (doc_id, source_item_id, payload, last_event_id)
                 VALUES (?, ?, ?, ?)`
              ).bind(
                event.source_item_id,
                event.source_item_id,
                event.payload,
                event.event_id
              )
            );
          }
        }
      }

      if (replayStatements.length > 0) {
        await this.db.batch(replayStatements);
      }
    } catch (err) {
      throw new Error(`Failed to rebuild read models: ${err}`);
    }
  }

  /**
   * Get read model snapshot
   */
  async getReadModelState(view: string): Promise<unknown> {
    try {
      const result = await this.db
        .prepare(`SELECT * FROM ${view}`)
        .all<unknown>();
      return result.results ?? [];
    } catch {
      return [];
    }
  }
}
