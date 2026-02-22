/**
 * Delta-Curator Worker
 * Cloudflare Workers entrypoint with fetch() and scheduled() handlers
 * Per AGENT_BRIEF2.md
 */

import { handleFetch } from './routes.js';
import type { Env } from './env.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleFetch(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Daily cron: run one batch for configured sources
    // In a real implementation, this would iterate over configured sources
    // For now, trigger the /run endpoint via internal request
    const url = new URL('https://worker/run');
    url.searchParams.set('once', 'true');

    try {
      await handleFetch(new Request(url, { method: 'POST' }), env);
    } catch (err) {
      console.error(`Scheduled batch failed: ${err}`);
    }
  }
};
