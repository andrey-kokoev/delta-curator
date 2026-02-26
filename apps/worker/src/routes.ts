/**
 * Worker Route Handlers
 * Implements POST /run, GET /inspect, GET /search, GET /health, /config/*
 * Per AGENT_BRIEF2.md section 4
 */

import { D1Committer, R2ArtifactStore, Runner, ConfigStore } from '@delta-curator/runtime';
import type { Comparator, Decider } from '@delta-curator/runtime';
import type { Env } from './env.js';
import { handleSeed } from './seed.js';
import { 
  handleMicrosoftLogin, 
  handleMicrosoftCallback, 
  handleLogout, 
  handleMe,
  getSession 
} from './auth/index.js';

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
    // Auth routes
    if (pathname === '/api/auth/microsoft' && method === 'GET') {
      return await handleMicrosoftLogin(request, env);
    }
    
    if (pathname === '/api/auth/microsoft/callback' && method === 'GET') {
      return await handleMicrosoftCallback(request, env);
    }
    
    if (pathname === '/api/auth/logout' && method === 'POST') {
      return handleLogout();
    }
    
    if (pathname === '/api/auth/me' && method === 'GET') {
      return await handleMe(request, env);
    }

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

    // POST /seed — seed initial config
    if (pathname === '/seed' && method === 'POST') {
      return await handleSeed(request, env.DB, env.ARTIFACTS);
    }

    // Config routes
    // GET /config — list all configs
    if (pathname === '/config' && method === 'GET') {
      return await handleConfigList(request, env);
    }

    // POST /config — create/update config
    if (pathname === '/config' && method === 'POST') {
      return await handleConfigWrite(request, env);
    }

    // GET /config/active — get active config
    if (pathname === '/config/active' && method === 'GET') {
      return await handleConfigGetActive(request, env);
    }

    // GET /config/:project_id — get specific config
    if (pathname.startsWith('/config/') && method === 'GET') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length === 2) {
        const projectId = parts[1];
        return await handleConfigRead(request, env, projectId);
      }
    }

    // POST /config/:project_id/activate — set active config
    if (pathname.startsWith('/config/') && pathname.endsWith('/activate') && method === 'POST') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length === 3 && parts[2] === 'activate') {
        const projectId = parts[1];
        return await handleConfigActivate(request, env, projectId);
      }
    }

    // DELETE /config/:project_id — delete config
    if (pathname.startsWith('/config/') && method === 'DELETE') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length === 2) {
        const projectId = parts[1];
        return await handleConfigDelete(request, env, projectId);
      }
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

// ============================================================================
// Config Routes
// ============================================================================

/**
 * GET /config
 * List all project configs (index only)
 */
async function handleConfigList(request: Request, env: Env): Promise<Response> {
  try {
    const store = new ConfigStore({ db: env.DB, bucket: env.ARTIFACTS });
    const result = await store.list();

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ configs: result.configs }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /config
 * Create or update a project config
 * Body: ProjectConfig object
 * Query: ?activate=true to also set as active
 */
async function handleConfigWrite(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const activate = url.searchParams.get('activate') === 'true';

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const store = new ConfigStore({ db: env.DB, bucket: env.ARTIFACTS });

    // Write config
    const result = await store.write(body, activate);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        project_id: result.projectId,
        r2_key: result.r2Key,
        hash: result.hash,
        active: activate
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /config/:project_id
 * Get a specific project config
 */
async function handleConfigRead(request: Request, env: Env, projectId: string): Promise<Response> {
  try {
    const store = new ConfigStore({ db: env.DB, bucket: env.ARTIFACTS });
    const result = await store.read(projectId);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 500;
      return new Response(
        JSON.stringify({ error: result.error }),
        { status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        config: result.config,
        index: result.index
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /config/:project_id/activate
 * Set project as active
 */
async function handleConfigActivate(request: Request, env: Env, projectId: string): Promise<Response> {
  try {
    const store = new ConfigStore({ db: env.DB, bucket: env.ARTIFACTS });
    const result = await store.setActive(projectId);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 500;
      return new Response(
        JSON.stringify({ error: result.error }),
        { status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        project_id: result.projectId
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /config/active
 * Get the currently active project config
 */
async function handleConfigGetActive(request: Request, env: Env): Promise<Response> {
  try {
    const store = new ConfigStore({ db: env.DB, bucket: env.ARTIFACTS });
    const result = await store.getActive();

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 500;
      return new Response(
        JSON.stringify({ error: result.error }),
        { status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        config: result.config,
        index: result.index
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * DELETE /config/:project_id
 * Delete a project config
 */
async function handleConfigDelete(request: Request, env: Env, projectId: string): Promise<Response> {
  try {
    const store = new ConfigStore({ db: env.DB, bucket: env.ARTIFACTS });
    const result = await store.delete(projectId);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        project_id: projectId,
        deleted: true
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
