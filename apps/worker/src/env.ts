/**
 * Cloudflare Worker environment with typed bindings
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
  LOG_VERBOSE?: string;
  
  // Auth
  AUTH_SECRET: string;
  AUTH_MICROSOFT_CLIENT_ID: string;
  AUTH_MICROSOFT_CLIENT_SECRET: string;
  AUTH_MICROSOFT_TENANT_ID: string;
  
  // CORS
  UI_URL: string;
  
  // Admin token for Bearer auth
  ADMIN_TOKEN: string;
}
