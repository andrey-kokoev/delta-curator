// Runtime package - interfaces, committer, runner, artifacts

// Global type declarations for Cloudflare bindings
// Note: D1Result and R2Object are already declared in @cloudflare/workers-types
declare global {
  interface D1Database {
    prepare(sql: string): D1PreparedStatement;
    batch(statements: D1PreparedStatement[]): Promise<any[]>;
    exec(sql: string): Promise<any>;
  }

  interface D1PreparedStatement {
    bind(...params: unknown[]): D1PreparedStatement;
    run(): Promise<any>;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[] }>;
  }

  interface R2Bucket {
    put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<any>;
    get(key: string): Promise<any | null>;
    delete(key: string): Promise<void>;
  }
}

export * from './interfaces/index.js';
export * from './commit/index.js';
export * from './runner/index.js';
export { R2ArtifactStore } from './artifacts/r2_store.js';
