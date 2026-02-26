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

    // Projects API (Dashboard)
    // GET /projects/activity — get activity counts per project
    if (pathname === '/projects/activity' && method === 'GET') {
      return await handleProjectsActivity(request, env);
    }

    // POST /projects/:id/review — mark project as reviewed
    if (pathname.startsWith('/projects/') && pathname.endsWith('/review') && method === 'POST') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length === 3 && parts[2] === 'review') {
        const projectId = parts[1];
        return await handleProjectReview(request, env, projectId);
      }
    }

    // PATCH /projects/:id — update project (e.g., pinned status)
    if (pathname.startsWith('/projects/') && method === 'PATCH') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length === 2) {
        const projectId = parts[1];
        return await handleProjectUpdate(request, env, projectId);
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
 * List all project configs with dashboard fields
 */
async function handleConfigList(request: Request, env: Env): Promise<Response> {
  try {
    // Check which columns exist (for backward compatibility)
    const columnsResult = await env.DB.prepare(
      `PRAGMA table_info(project_configs)`
    ).all<{ name: string }>();
    const columns = new Set((columnsResult.results || []).map(r => r.name));
    
    const hasPinned = columns.has('pinned');
    const hasLastReviewed = columns.has('last_reviewed_at');
    const hasLastActivity = columns.has('last_activity_at');

    // Build query based on available columns
    let query: string;
    if (hasPinned && hasLastReviewed && hasLastActivity) {
      query = `SELECT 
        project_id, version, project_name, is_active, r2_key, hash, created_at, updated_at,
        pinned, last_reviewed_at, last_activity_at
      FROM project_configs 
      ORDER BY updated_at DESC`;
    } else {
      query = `SELECT 
        project_id, version, project_name, is_active, r2_key, hash, created_at, updated_at
      FROM project_configs 
      ORDER BY updated_at DESC`;
    }

    const result = await env.DB.prepare(query).all<{
      project_id: string;
      version: string;
      project_name: string;
      is_active: number;
      r2_key: string;
      hash: string;
      created_at: string;
      updated_at: string;
      pinned?: number;
      last_reviewed_at?: string | null;
      last_activity_at?: string | null;
    }>();

    const rows = result.results || [];

    // Enrich with topic_label and sources_count from R2
    const configs = await Promise.all(
      rows.map(async (row) => {
        let topicLabel = 'Unknown';
        let sourcesCount = 0;

        try {
          const obj = await env.ARTIFACTS.get(row.r2_key);
          if (obj) {
            const content = await obj.text();
            const config = JSON.parse(content);
            topicLabel = config.topic?.label || 'Unknown';
            sourcesCount = config.sources?.length || 0;
          }
        } catch {
          // Fallback to defaults if R2 fetch fails
        }

        return {
          project_id: row.project_id,
          version: row.version,
          project_name: row.project_name,
          is_active: Boolean(row.is_active),
          r2_key: row.r2_key,
          hash: row.hash,
          created_at: row.created_at,
          updated_at: row.updated_at,
          topic_label: topicLabel,
          sources_count: sourcesCount,
          pinned: Boolean(row.pinned),
          last_reviewed_at: row.last_reviewed_at || null,
          last_activity_at: row.last_activity_at || null
        };
      })
    );

    return new Response(
      JSON.stringify({ configs }),
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

// ============================================================================
// Projects API (Dashboard)
// ============================================================================

interface ProjectListItem {
  project_id: string;
  project_name: string;
  topic_label: string;
  sources_count: number;
  pinned: boolean;
  last_reviewed_at: string | null;
  last_activity_at: string | null;
}

/**
 * POST /projects/:id/review
 * Mark project as reviewed (sets last_reviewed_at to now)
 */
async function handleProjectReview(request: Request, env: Env, projectId: string): Promise<Response> {
  try {
    // Check which columns exist (for backward compatibility)
    const columnsResult = await env.DB.prepare(
      `PRAGMA table_info(project_configs)`
    ).all<{ name: string }>();
    const columns = new Set((columnsResult.results || []).map(r => r.name));
    const hasLastReviewed = columns.has('last_reviewed_at');

    const now = new Date().toISOString();

    if (hasLastReviewed) {
      const result = await env.DB.prepare(
        `UPDATE project_configs 
         SET last_reviewed_at = ?, updated_at = ?
         WHERE project_id = ?`
      ).bind(now, now, projectId).run();

      if (result.meta.changes === 0) {
        return new Response(
          JSON.stringify({ error: 'Project not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch updated project
    const hasPinned = columns.has('pinned');
    const hasLastActivity = columns.has('last_activity_at');
    
    let query: string;
    if (hasPinned && hasLastReviewed && hasLastActivity) {
      query = `SELECT 
        pc.project_id,
        pc.project_name,
        pc.pinned,
        pc.last_reviewed_at,
        pc.last_activity_at,
        pc.r2_key
      FROM project_configs pc
      WHERE pc.project_id = ?`;
    } else {
      query = `SELECT 
        pc.project_id,
        pc.project_name,
        pc.r2_key
      FROM project_configs pc
      WHERE pc.project_id = ?`;
    }

    const row = await env.DB.prepare(query).bind(projectId).first<{
      project_id: string;
      project_name: string;
      pinned?: number;
      last_reviewed_at?: string | null;
      last_activity_at?: string | null;
      r2_key: string;
    }>();

    if (!row) {
      return new Response(
        JSON.stringify({ error: 'Project not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get config from R2 for topic and sources
    let topicLabel = 'Unknown';
    let sourcesCount = 0;
    try {
      const obj = await env.ARTIFACTS.get(row.r2_key);
      if (obj) {
        const content = await obj.text();
        const config = JSON.parse(content);
        topicLabel = config.topic?.label || 'Unknown';
        sourcesCount = config.sources?.length || 0;
      }
    } catch {
      // Fallback
    }

    const project: ProjectListItem = {
      project_id: row.project_id,
      project_name: row.project_name,
      topic_label: topicLabel,
      sources_count: sourcesCount,
      pinned: Boolean(row.pinned),
      last_reviewed_at: hasLastReviewed ? (row.last_reviewed_at || now) : now,
      last_activity_at: row.last_activity_at || null
    };

    return new Response(
      JSON.stringify({ success: true, project }),
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
 * PATCH /projects/:id
 * Update project fields (e.g., pinned status)
 */
async function handleProjectUpdate(request: Request, env: Env, projectId: string): Promise<Response> {
  try {
    const body = await request.json() as { pinned?: boolean };

    if (typeof body.pinned !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: pinned must be a boolean' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check which columns exist (for backward compatibility)
    const columnsResult = await env.DB.prepare(
      `PRAGMA table_info(project_configs)`
    ).all<{ name: string }>();
    const columns = new Set((columnsResult.results || []).map(r => r.name));
    const hasPinned = columns.has('pinned');

    const now = new Date().toISOString();

    if (hasPinned) {
      const result = await env.DB.prepare(
        `UPDATE project_configs 
         SET pinned = ?, updated_at = ?
         WHERE project_id = ?`
      ).bind(body.pinned ? 1 : 0, now, projectId).run();

      if (result.meta.changes === 0) {
        return new Response(
          JSON.stringify({ error: 'Project not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch updated project
    const hasLastReviewed = columns.has('last_reviewed_at');
    const hasLastActivity = columns.has('last_activity_at');
    
    let query: string;
    if (hasPinned && hasLastReviewed && hasLastActivity) {
      query = `SELECT 
        pc.project_id,
        pc.project_name,
        pc.pinned,
        pc.last_reviewed_at,
        pc.last_activity_at,
        pc.r2_key
      FROM project_configs pc
      WHERE pc.project_id = ?`;
    } else {
      query = `SELECT 
        pc.project_id,
        pc.project_name,
        pc.r2_key
      FROM project_configs pc
      WHERE pc.project_id = ?`;
    }

    const row = await env.DB.prepare(query).bind(projectId).first<{
      project_id: string;
      project_name: string;
      pinned?: number;
      last_reviewed_at?: string | null;
      last_activity_at?: string | null;
      r2_key: string;
    }>();

    if (!row) {
      return new Response(
        JSON.stringify({ error: 'Project not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get config from R2 for topic and sources
    let topicLabel = 'Unknown';
    let sourcesCount = 0;
    try {
      const obj = await env.ARTIFACTS.get(row.r2_key);
      if (obj) {
        const content = await obj.text();
        const config = JSON.parse(content);
        topicLabel = config.topic?.label || 'Unknown';
        sourcesCount = config.sources?.length || 0;
      }
    } catch {
      // Fallback
    }

    const project: ProjectListItem = {
      project_id: row.project_id,
      project_name: row.project_name,
      topic_label: topicLabel,
      sources_count: sourcesCount,
      pinned: hasPinned ? Boolean(row.pinned) : body.pinned,
      last_reviewed_at: row.last_reviewed_at || null,
      last_activity_at: row.last_activity_at || null
    };

    return new Response(
      JSON.stringify({ success: true, project }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

interface ActivityResult {
  project_id: string;
  events_count: number;
  last_activity_at: string | null;
}

/**
 * GET /projects/activity?window=24h|7d|since_review
 * Get activity counts per project for the specified window
 */
async function handleProjectsActivity(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const window = url.searchParams.get('window') || '24h';

    // Check which columns exist (for backward compatibility)
    const columnsResult = await env.DB.prepare(
      `PRAGMA table_info(project_configs)`
    ).all<{ name: string }>();
    const columns = new Set((columnsResult.results || []).map(r => r.name));
    const hasLastReviewed = columns.has('last_reviewed_at');
    const hasLastActivity = columns.has('last_activity_at');

    // Get all projects with their last_reviewed_at (if column exists)
    let query: string;
    if (hasLastReviewed && hasLastActivity) {
      query = `SELECT project_id, last_reviewed_at, last_activity_at FROM project_configs`;
    } else if (hasLastReviewed) {
      query = `SELECT project_id, last_reviewed_at FROM project_configs`;
    } else if (hasLastActivity) {
      query = `SELECT project_id, last_activity_at FROM project_configs`;
    } else {
      query = `SELECT project_id FROM project_configs`;
    }

    const projectsResult = await env.DB.prepare(query).all<{
      project_id: string;
      last_reviewed_at?: string | null;
      last_activity_at?: string | null;
    }>();

    const projects = projectsResult.results || [];

    // Calculate time threshold based on window
    const now = Date.now();
    let timeThreshold: string | null = null;

    if (window === '24h') {
      timeThreshold = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    } else if (window === '7d') {
      timeThreshold = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    // For 'since_review', we'll use per-project last_reviewed_at

    // Get activity counts per project
    const activityResults: ActivityResult[] = await Promise.all(
      projects.map(async (project) => {
        let count = 0;

        if (window === 'since_review' && hasLastReviewed) {
          // Use project's last_reviewed_at, fallback to 7 days ago if null
          const reviewThreshold = project.last_reviewed_at 
            ? project.last_reviewed_at 
            : new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

          const countResult = await env.DB.prepare(
            `SELECT COUNT(*) as total FROM commits 
             WHERE project_id = ? AND created_at > ?`
          ).bind(project.project_id, reviewThreshold).first<{ total: number }>();

          count = countResult?.total || 0;
        } else if (timeThreshold) {
          const countResult = await env.DB.prepare(
            `SELECT COUNT(*) as total FROM commits 
             WHERE project_id = ? AND created_at > ?`
          ).bind(project.project_id, timeThreshold).first<{ total: number }>();

          count = countResult?.total || 0;
        }

        return {
          project_id: project.project_id,
          events_count: count,
          last_activity_at: project.last_activity_at || null
        };
      })
    );

    return new Response(
      JSON.stringify({ activity: activityResults }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
