/**
 * SQLite-based committer implementation
 * Enforces invariants I0 (append-only), I1 (atomic progress), I2 (semantic identity)
 */

import sqlite3 from 'sqlite3';
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
 * SQLiteCommitter: atomic, idempotent persistence
 */
export class SQLiteCommitter implements Committer {
  id = 'sqlite-v0';
  version = '0.1.0';
  description = 'Event-sourced append-only SQLite committer with artifact support';

  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize database connection and schema
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          // Enable foreign keys
          await this.runAsync('PRAGMA foreign_keys = ON');

          // Create schema
          await this.execAsync(SCHEMA_DDL);

          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Helper: run a SQL statement
   */
  private runAsync(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Helper: execute multiple SQL statements
   */
  private execAsync(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Helper: get a single row
   */
  private getAsync(sql: string, params: unknown[] = []): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Helper: get all rows
   */
  private allAsync(sql: string, params: unknown[] = []): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Atomically persist a commit
   * Returns idempotently: same commitKey → same commitId
   *
   * Transaction flow:
   * 1. Check idempotency: if commitKey exists, return existing commitId
   * 2. Generate commitId
   * 3. BEGIN TRANSACTION
   * 4. Insert commit record
   * 5. Insert events (idempotent by event_id PRIMARY KEY)
   * 6. Apply mutations to read models
   * 7. Update source_state cursor (I1: only here)
   * 8. Record artifacts
   * 9. COMMIT
   */
  async commit(req: CommitRequest): Promise<CommitResponse> {
    if (!this.db) {
      throw new Error('Committer not initialized. Call init() first.');
    }

    // Step 1: Check idempotency
    const existing = (await this.getAsync(
      'SELECT commit_id FROM commits WHERE commit_key = ?',
      [req.commitKey]
    )) as any;

    if (existing) {
      return { commitId: existing.commit_id };
    }

    // Step 2: Generate commit ID
    const commitId = generateCommitId(req.commitKey);

    // Step 3-9: Atomic transaction
    try {
      await this.execAsync('BEGIN TRANSACTION');

      // Step 4: Insert commit record
      await this.runAsync(
        `INSERT INTO commits
         (commit_id, commit_key, trace_id, source_id, old_state, new_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          commitId,
          req.commitKey,
          req.traceId,
          req.sourceId,
          canonicalJson(req.oldState),
          canonicalJson(req.newState),
          new Date().toISOString()
        ]
      );

      // Step 5: Insert events (idempotent by event_id PRIMARY KEY)
      for (const event of req.events) {
        await this.runAsync(
          `INSERT OR IGNORE INTO events
           (event_id, commit_id, event_type, event_version, payload_hash,
            trace_id, source_id, source_item_id, candidate_seq, observed_at, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
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
          ]
        );
      }

      // Step 6: Apply mutations to read models
      await this.applyMutations(req.mutations);

      // Step 7: Update source_state cursor (I1: only here)
      await this.runAsync(
        `INSERT OR REPLACE INTO source_state
         (source_id, state, last_commit_id, last_commit_key, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          req.sourceId,
          canonicalJson(req.newState),
          commitId,
          req.commitKey,
          new Date().toISOString()
        ]
      );

      // Step 8: Record artifacts
      if (req.artifacts) {
        for (const [name, ref] of Object.entries(req.artifacts)) {
          await this.runAsync(
            `INSERT INTO artifacts
             (artifact_key, commit_id, name, sha256, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              ref.key,
              commitId,
              name,
              ref.sha256,
              new Date().toISOString()
            ]
          );
        }
      }

      // Step 9: COMMIT
      await this.execAsync('COMMIT TRANSACTION');

      return { commitId };
    } catch (error) {
      await this.execAsync('ROLLBACK TRANSACTION').catch(() => {
        // Ignore rollback errors
      });
      throw error;
    }
  }

  /**
   * Apply mutations to read models
   */
  private async applyMutations(mutations: ViewMutation[]): Promise<void> {
    for (const mutation of mutations) {
      if (mutation.operation === 'insert') {
        if (mutation.view === 'curated_docs') {
          await this.runAsync(
            `INSERT OR IGNORE INTO curated_docs
             (doc_id, source_item_id, payload, last_event_id)
             VALUES (?, ?, ?, ?)`,
            [
              mutation.key,
              (mutation.data as any)?.source_item_id,
              canonicalJson((mutation.data as any)?.payload),
              (mutation.data as any)?.last_event_id
            ]
          );
        } else if (mutation.view === 'hold_index') {
          await this.runAsync(
            `INSERT OR IGNORE INTO hold_index
             (hold_id, source_item_id, event_id, reason)
             VALUES (?, ?, ?, ?)`,
            [
              mutation.key,
              (mutation.data as any)?.source_item_id,
              (mutation.data as any)?.event_id,
              (mutation.data as any)?.reason
            ]
          );
        }
      } else if (mutation.operation === 'delete') {
        await this.runAsync(`DELETE FROM ${mutation.view} WHERE ${mutation.view}_id = ?`, [
          mutation.key
        ]);
      }
    }
  }

  /**
   * Rebuild read models from events (I0 guarantee)
   * Drops all read model tables and replays events
   */
  async rebuildToHead(): Promise<void> {
    try {
      await this.execAsync('BEGIN TRANSACTION');

      // Drop read model tables
      await this.execAsync('DROP TABLE IF EXISTS facet_index');
      await this.execAsync('DROP TABLE IF EXISTS fingerprint_index');
      await this.execAsync('DROP TABLE IF EXISTS hold_index');
      await this.execAsync('DROP TABLE IF EXISTS curated_docs');

      // Recreate tables
      await this.execAsync(`
        CREATE TABLE IF NOT EXISTS facet_index (
          facet_id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          facet_key TEXT NOT NULL,
          facet_value TEXT NOT NULL,
          FOREIGN KEY (event_id) REFERENCES events(event_id)
        );

        CREATE TABLE IF NOT EXISTS fingerprint_index (
          fingerprint TEXT PRIMARY KEY,
          source_item_id TEXT NOT NULL,
          payload_hash TEXT NOT NULL,
          first_event_id TEXT NOT NULL,
          FOREIGN KEY (first_event_id) REFERENCES events(event_id)
        );

        CREATE TABLE IF NOT EXISTS hold_index (
          hold_id TEXT PRIMARY KEY,
          source_item_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          reason TEXT,
          FOREIGN KEY (event_id) REFERENCES events(event_id)
        );

        CREATE TABLE IF NOT EXISTS curated_docs (
          doc_id TEXT PRIMARY KEY,
          source_item_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          last_event_id TEXT NOT NULL,
          FOREIGN KEY (last_event_id) REFERENCES events(event_id)
        );
      `);

      // Replay events: derive read models
      const events = (await this.allAsync('SELECT * FROM events ORDER BY rowid')) as any[];

      for (const event of events) {
        // Simplified replay: for now, just populate curated_docs
        if (event.event_type === 'item_appended') {
          await this.runAsync(
            `INSERT OR REPLACE INTO curated_docs
             (doc_id, source_item_id, payload, last_event_id)
             VALUES (?, ?, ?, ?)`,
            [event.source_item_id, event.source_item_id, event.payload, event.event_id]
          );
        }
      }

      await this.execAsync('COMMIT TRANSACTION');
    } catch (error) {
      await this.execAsync('ROLLBACK TRANSACTION').catch(() => {});
      throw error;
    }
  }

  /**
   * Get read model snapshot
   */
  async getReadModelState(view: string): Promise<unknown> {
    return await this.allAsync(`SELECT * FROM ${view}`);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else {
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
