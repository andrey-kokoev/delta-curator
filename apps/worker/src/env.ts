/**
 * Cloudflare Worker environment with typed bindings
 * Imports @delta-curator/runtime which declares global D1, R2, etc. types
 */

import '@delta-curator/runtime';

declare global {
  interface Ai {
    run(model: string, input: unknown): Promise<{ data: { score: number }[] }>;
  }
}

export interface Env {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  
  // Auth
  AUTH_SECRET: string;
  AUTH_MICROSOFT_CLIENT_ID: string;
  AUTH_MICROSOFT_CLIENT_SECRET: string;
  AUTH_MICROSOFT_TENANT_ID: string;
  
  // Session KV (optional, can use D1 instead)
  SESSIONS?: KVNamespace;
}
