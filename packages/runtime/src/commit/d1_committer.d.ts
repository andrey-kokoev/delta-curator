/**
 * D1-based committer implementation (Cloudflare D1)
 * Enforces invariants I0 (append-only), I1 (atomic progress), I2 (semantic identity)
 * Per AGENT_BRIEF2.md
 */
import type { CommitRequest, CommitResponse } from '@delta-curator/protocol';
import type { Committer } from '../interfaces/index.js';
declare global {
    interface D1Database {
        prepare(sql: string): D1PreparedStatement;
        batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
        exec(sql: string): Promise<D1Result>;
    }
    interface D1PreparedStatement {
        bind(...params: unknown[]): D1PreparedStatement;
        run(): Promise<D1Result>;
        first<T = unknown>(): Promise<T | null>;
        all<T = unknown>(): Promise<{
            results: T[];
        }>;
    }
    interface D1Result {
        success: boolean;
        meta?: {
            duration: number;
            changes?: number;
            last_row_id?: number;
        };
        results?: unknown[];
    }
}
/**
 * D1Committer: atomic, idempotent persistence via Cloudflare D1
 */
export declare class D1Committer implements Committer {
    private db;
    id: string;
    version: string;
    description: string;
    constructor(db: D1Database);
    /**
     * Initialize database: execute schema DDL
     * D1 does not support multi-statement exec, so we batch all CREATE statements
     */
    init(): Promise<void>;
    /**
     * Atomically persist a commit
     * Returns idempotently: same commitKey → same commitId
     */
    commit(req: CommitRequest): Promise<CommitResponse>;
    /**
     * Convert ViewMutation to D1 prepared statements
     */
    private getMutationStatements;
    /**
     * Rebuild read models from events (I0 guarantee)
     */
    rebuildToHead(): Promise<void>;
    /**
     * Get read model snapshot
     */
    getReadModelState(view: string): Promise<unknown>;
}
//# sourceMappingURL=d1_committer.d.ts.map