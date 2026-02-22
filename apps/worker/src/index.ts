/**
 * Delta-Curator Worker
 * Cloudflare Workers entrypoint with fetch() and scheduled() handlers
 * Per AGENT_BRIEF2.md
 */

import { handleFetch } from './routes.js';
import type { Env } from './env.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },

  async scheduled(_event: any, env: Env): Promise<void> {
    try {
      // Call the run endpoint for scheduled execution
      const url = new URL('https://worker/run');
      url.searchParams.set('once', 'true');
      await handleFetch(new Request(url, { method: 'POST' }), env);
    } catch (err) {
      console.error(`Scheduled batch failed: ${err}`);
    }
  }
};
