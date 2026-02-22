/**
 * Worker Route Handlers
 * Implements POST /run, GET /inspect, GET /search, GET /health
 * Per AGENT_BRIEF2.md section 4
 */

import { D1Committer, R2ArtifactStore, Runner } from '@delta-curator/runtime';
import type { Comparator, Decider } from '@delta-curator/runtime';
import type { Env } from './env.js';

/**
 * Stub Comparator for testing
 */
class StubComparator implements Comparator {
  id = 'stub_comparator';
  version = '0.1.0';
  description = 'Stub comparator for testing';

  async compare() {
    return {
      source_item_id: 'stub',
      novelty: 'novel' as const,
      confidence: 0.5,
      rationale: 'Stub comparison'
    };
  }
}

/**
 * Stub Decider for testing
 */
class StubDecider implements Decider {
  id = 'stub_decider';
  version = '0.1.0';
  description = 'Stub decider for testing';

  async decide() {
    return {
      source_item_id: 'stub',
      decision: 'append' as const,
      reason: 'Stub decision',
      targetId: 'stub'
    };
  }
}

/**
 * Main route handler: dispatches requests to appropriate endpoint
 */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  try {
    // POST /run — execute one batch
    if (pathname === '/run' && method === 'POST') {
      return await handleRun(request, env);
    }

    // GET /inspect — retrieve batch digest
    if (pathname === '/inspect' && method === 'GET') {
      return await handleInspect(request, env);
    }

    // GET /search — query and rank documents
    if (pathname === '/search' && method === 'GET') {
      return await handleSearch(request, env);
    }

    // GET /health — health check
    if (pathname === '/health' && method === 'GET') {
      return await handleHealth(request, env);
    }

    // Not found
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(`Route error: ${err}`);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /run
 * Body: { source_id, max_items, once }
 * Runs one batch cycle and returns { commit_id?, items_processed, events_written }
 */
async function handleRun(request: Request, env: Env): Promise<Response> {
  try {
    // Initialize committer and plugins
    const committer = new D1Committer(env.DB);
    await committer.init();

    const comparator = new StubComparator();
    const decider = new StubDecider();

    // TODO: Create actual FileDropSource or config-driven source
    // For now, create a stub source that returns no items
    const stubSource = {
      id: 'stub_source',
      version: '0.1.0',
      description: 'Stub source for testing',
      async readBatch() {
        return null; // No items
      }
    };

    // TODO: Integrate ranker if enabled in config
    // const ranker = new WorkersAIRanker(env.AI, 'Regeneron FDA communications');

    const runner = new Runner(stubSource, committer, comparator, decider);

    // Run batch
    const result = await runner.runBatch();

    if (!result) {
      return new Response(
        JSON.stringify({
          commit_id: null,
          items_processed: 0,
          events_written: 0
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        commit_id: result.commitId,
        items_processed: 1,
        events_written: 3,
        trace_id: result.traceId
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /inspect?since=PT24H&format=markdown
 * Returns markdown digest of deltas/decisions/holds, sorted by rank_score when present
 */
async function handleInspect(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const since = url.searchParams.get('since') || 'PT24H';
    const format = url.searchParams.get('format') || 'markdown';

    // TODO: Query events and commits since window
    // TODO: Format as markdown or JSON
    // TODO: Sort by rank_score from signals if present

    const markdown = `# Delta-Curator Digest

## Summary
- No events since ${since}

---
Generated at ${new Date().toISOString()}
`;

    if (format === 'markdown') {
      return new Response(markdown, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown' }
      });
    }

    return new Response(JSON.stringify({ markdown }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /search?q=...&k=20&rerank=true
 * Query-time retrieval using curated_docs (+ optional AI Search reranking when available)
 */
async function handleSearch(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const k = parseInt(url.searchParams.get('k') || '20');
    const rerank = url.searchParams.get('rerank') === 'true';

    // TODO: Query AI Search for initial retrieval (when available)
    // TODO: Optionally rerank results if enabled
    // For now, return empty results or docs from curated_docs

    const results = {
      query: q,
      k,
      rerank,
      docs: [],
      total: 0,
      took_ms: 0
    };

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /health
 * Health check: returns { ok: true, version, last_commit_id? }
 */
async function handleHealth(request: Request, env: Env): Promise<Response> {
  try {
    const committer = new D1Committer(env.DB);
    await committer.init();

    // Query last commit
    const lastCommit = await env.DB
      .prepare('SELECT commit_id FROM commits ORDER BY rowid DESC LIMIT 1')
      .first<{ commit_id: string }>();

    return new Response(
      JSON.stringify({
        ok: true,
        version: '0.1.0',
        last_commit_id: lastCommit?.commit_id
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(err)
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
