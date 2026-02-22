/**
 * SQLite-based committer implementation
 * Enforces invariants I0 (append-only), I1 (atomic progress), I2 (semantic identity)
 */
import type { CommitRequest, CommitResponse } from '@delta-curator/protocol';
import type { Committer } from '../interfaces/index.js';
/**
 * SQLiteCommitter: atomic, idempotent persistence
 */
export declare class SQLiteCommitter implements Committer {
    id: string;
    version: string;
    description: string;
    private db;
    private dbPath;
    constructor(dbPath: string);
    /**
     * Initialize database connection and schema
     */
    init(): Promise<void>;
    /**
     * Helper: run a SQL statement
     */
    private runAsync;
    /**
     * Helper: execute multiple SQL statements
     */
    private execAsync;
    /**
     * Helper: get a single row
     */
    private getAsync;
    /**
     * Helper: get all rows
     */
    private allAsync;
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
    commit(req: CommitRequest): Promise<CommitResponse>;
    /**
     * Apply mutations to read models
     */
    private applyMutations;
    /**
     * Rebuild read models from events (I0 guarantee)
     * Drops all read model tables and replays events
     */
    rebuildToHead(): Promise<void>;
    /**
     * Get read model snapshot
     */
    getReadModelState(view: string): Promise<unknown>;
    /**
     * Close database connection
     */
    close(): Promise<void>;
}
//# sourceMappingURL=sqlite_committer.d.ts.map