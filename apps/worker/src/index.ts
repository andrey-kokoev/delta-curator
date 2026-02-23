/**
 * Delta-Curator Worker - Full API Implementation
 * Cloudflare Workers entrypoint with complete API handlers
 */

import type { Env } from './env';
import type { ProjectConfig, ProjectConfigIndex } from '@delta-curator/protocol';

// ============================================================================
// Types
// ============================================================================

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  roles: string[];
}

interface Session {
  user: User;
  expiresAt: number;
}

interface ConfigWriteResult {
  success: boolean;
  projectId?: string;
  version?: string;
  r2Key?: string;
  hash?: string;
  error?: string;
}

// ============================================================================
// CORS Handling
// ============================================================================

function handleCors(request: Request, env: Env): Response {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigins = env.UI_URL ? [env.UI_URL] : ['*'];
  const allowOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(origin) 
    ? origin : allowedOrigins[0];
  
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    }
  });
}

function addCorsHeaders(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigins = env.UI_URL ? [env.UI_URL] : ['*'];
  const allowOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(origin) 
    ? origin : allowedOrigins[0];
  
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// ============================================================================
// Auth - Session Management
// ============================================================================

const SESSION_COOKIE = 'dc_session';
const OAUTH_STATE_COOKIE = 'dc_oauth_state';

async function signSession(session: Session, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(session));
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const payload = btoa(JSON.stringify(session));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return `${payload}.${sig}`;
}

async function verifySession(token: string, secret: string): Promise<Session | null> {
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;
    
    const payload = JSON.parse(atob(payloadB64)) as Session;
    if (payload.expiresAt < Date.now()) return null;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signature = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const data = encoder.encode(JSON.stringify(payload));
    
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;
    
    return payload;
  } catch {
    return null;
  }
}

async function getSession(request: Request, env: Env): Promise<Session | null> {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  
  return verifySession(match[1], env.AUTH_SECRET);
}

function setSessionCookie(response: Response, token: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=86400`);
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function clearSessionCookie(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`);
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// ============================================================================
// Auth - Microsoft OAuth
// ============================================================================

function generateState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}

async function handleMicrosoftLogin(request: Request, env: Env): Promise<Response> {
  const state = generateState();
  const redirectUri = new URL(request.url).origin + '/api/auth/microsoft/callback';
  
  const authUrl = new URL(`https://login.microsoftonline.com/${env.AUTH_MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', env.AUTH_MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString(),
      'Set-Cookie': `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`
    }
  });
}

async function handleMicrosoftCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  // Verify state
  const cookie = request.headers.get('Cookie') || '';
  const stateMatch = cookie.match(new RegExp(`${OAUTH_STATE_COOKIE}=([^;]+)`));
  const savedState = stateMatch ? stateMatch[1] : null;
  
  if (!state || state !== savedState) {
    return new Response(JSON.stringify({ error: 'Invalid state' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!code) {
    return new Response(JSON.stringify({ error: 'No code provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Exchange code for token
    const redirectUri = url.origin + '/api/auth/microsoft/callback';
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${env.AUTH_MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.AUTH_MICROSOFT_CLIENT_ID,
          client_secret: env.AUTH_MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      }
    );
    
    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }
    
    const tokens = await tokenResponse.json() as { id_token: string };
    
    // Parse ID token
    const idTokenParts = tokens.id_token.split('.');
    const idTokenPayload = JSON.parse(atob(idTokenParts[1])) as {
      oid: string;
      email: string;
      name: string;
      picture?: string;
    };
    
    const user: User = {
      id: idTokenPayload.oid,
      email: idTokenPayload.email,
      name: idTokenPayload.name,
      avatar: idTokenPayload.picture,
      roles: ['user']
    };
    
    const session: Session = {
      user,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    };
    
    const token = await signSession(session, env.AUTH_SECRET);
    
    const response = new Response(null, {
      status: 302,
      headers: { 'Location': env.UI_URL || '/' }
    });
    
    return setSessionCookie(response, token);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Authentication failed: ' + (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function handleLogout(): Response {
  const response = new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
  return clearSessionCookie(response);
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify(session.user), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ============================================================================
// Config Store Implementation
// ============================================================================

function computeHash(content: string): string {
  // Simple hash - in production use proper SHA-256
  return Array.from(content).reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0).toString(16);
}

function generateR2Key(projectId: string, version: string, prefix = 'configs/'): string {
  return `${prefix}${projectId}/${version}.json`;
}

function canonicalJson(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

function validateProjectConfig(config: unknown): { success: boolean; data?: ProjectConfig; error?: string } {
  try {
    const c = config as ProjectConfig;
    if (!c.project_id) return { success: false, error: 'project_id required' };
    if (!c.project_name) return { success: false, error: 'project_name required' };
    if (!c.topic) return { success: false, error: 'topic required' };
    if (!c.sources || !Array.isArray(c.sources) || c.sources.length === 0) {
      return { success: false, error: 'at least one source required' };
    }
    if (!c.pipeline) return { success: false, error: 'pipeline required' };
    if (!c.storage) return { success: false, error: 'storage required' };
    return { success: true, data: c };
  } catch (e) {
    return { success: false, error: 'Invalid config format' };
  }
}

async function writeConfig(
  env: Env, 
  config: unknown, 
  isActive = false
): Promise<ConfigWriteResult> {
  const validation = validateProjectConfig(config);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }
  
  const validConfig = validation.data!;
  const projectId = validConfig.project_id;
  const version = validConfig.version || '1.0.0';
  const projectName = validConfig.project_name;
  const now = new Date().toISOString();
  
  const content = canonicalJson(validConfig);
  const hash = computeHash(content);
  const r2Key = generateR2Key(projectId, version);
  
  try {
    // Write to R2 first
    await env.ARTIFACTS.put(r2Key, content, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { 'project-id': projectId, version, hash }
    });
    
    // Write to D1
    await env.DB.prepare(
      `INSERT OR REPLACE INTO project_configs
       (project_id, version, project_name, is_active, r2_key, hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      projectId,
      version,
      projectName,
      isActive ? 1 : 0,
      r2Key,
      hash,
      validConfig.created_at || now,
      now
    ).run();
    
    return {
      success: true,
      projectId,
      version,
      r2Key,
      hash
    };
  } catch (err) {
    // Cleanup R2 on error
    try { await env.ARTIFACTS.delete(r2Key); } catch {}
    return { success: false, error: `Failed to write config: ${err}` };
  }
}

async function readConfig(env: Env, projectId: string): Promise<{ config?: ProjectConfig; index?: ProjectConfigIndex; error?: string }> {
  try {
    const index = await env.DB.prepare(
      'SELECT * FROM project_configs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1'
    ).bind(projectId).first<ProjectConfigIndex>();
    
    if (!index) {
      return { error: `Config not found for project: ${projectId}` };
    }
    
    const obj = await env.ARTIFACTS.get(index.r2_key);
    if (!obj) {
      return { error: `Config object not found in R2: ${index.r2_key}` };
    }
    
    const content = await obj.text();
    const parsed = JSON.parse(content) as ProjectConfig;
    
    return { config: parsed, index };
  } catch (err) {
    return { error: `Failed to read config: ${err}` };
  }
}

async function readConfigVersion(env: Env, projectId: string, version: string): Promise<{ config?: ProjectConfig; index?: ProjectConfigIndex; error?: string }> {
  try {
    const r2Key = generateR2Key(projectId, version);
    
    const index = await env.DB.prepare(
      'SELECT * FROM project_configs WHERE project_id = ? AND version = ?'
    ).bind(projectId, version).first<ProjectConfigIndex>();
    
    if (!index) {
      return { error: `Config not found for project: ${projectId}, version: ${version}` };
    }
    
    const obj = await env.ARTIFACTS.get(r2Key);
    if (!obj) {
      return { error: `Config object not found in R2: ${r2Key}` };
    }
    
    const content = await obj.text();
    const parsed = JSON.parse(content) as ProjectConfig;
    
    return { config: parsed, index };
  } catch (err) {
    return { error: `Failed to read config: ${err}` };
  }
}

async function listConfigs(env: Env): Promise<{ configs: ProjectConfigIndex[]; error?: string }> {
  try {
    const result = await env.DB.prepare(
      'SELECT * FROM project_configs ORDER BY updated_at DESC'
    ).all<ProjectConfigIndex>();
    
    return { configs: result.results || [] };
  } catch (err) {
    return { configs: [], error: `Failed to list configs: ${err}` };
  }
}

async function setActiveConfig(env: Env, projectId: string, version?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (version) {
      await env.DB.prepare(
        `UPDATE project_configs 
         SET is_active = CASE WHEN version = ? THEN 1 ELSE 0 END,
         updated_at = ?
         WHERE project_id = ?`
      ).bind(version, new Date().toISOString(), projectId).run();
    } else {
      await env.DB.prepare(
        `UPDATE project_configs 
         SET is_active = CASE 
           WHEN version = (SELECT version FROM project_configs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1) 
           THEN 1 ELSE 0 
         END,
         updated_at = ?
         WHERE project_id = ?`
      ).bind(projectId, new Date().toISOString(), projectId).run();
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to set active: ${err}` };
  }
}

async function getActiveConfig(env: Env): Promise<{ config?: ProjectConfig; index?: ProjectConfigIndex; error?: string }> {
  try {
    const index = await env.DB.prepare(
      'SELECT * FROM project_configs WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1'
    ).first<ProjectConfigIndex>();
    
    if (!index) {
      return { error: 'No active config found' };
    }
    
    return readConfig(env, index.project_id);
  } catch (err) {
    return { error: `Failed to get active config: ${err}` };
  }
}

async function deleteConfig(env: Env, projectId: string, version: string): Promise<{ success: boolean; error?: string }> {
  try {
    const r2Key = generateR2Key(projectId, version);
    
    await env.DB.prepare(
      'DELETE FROM project_configs WHERE project_id = ? AND version = ?'
    ).bind(projectId, version).run();
    
    await env.ARTIFACTS.delete(r2Key);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete: ${err}` };
  }
}

async function seedConfig(env: Env): Promise<{ success: boolean; projectId?: string; error?: string }> {
  const seedConfig: ProjectConfig = {
    version: '1.0.0',
    project_id: 'quickstart-demo',
    project_name: 'Quickstart Demo Project',
    topic: { id: 'demo-topic-v0', label: 'Example topic for demonstration' },
    sources: [{
      id: 'demo-rss-source',
      plugin: 'rss_source',
      config: { feed_url: 'https://example.com/feed.xml', user_agent: 'delta-curator/0.1', max_items_per_batch: 50 }
    }],
    pipeline: {
      normalizer: { plugin: 'text_normalizer', config: {} },
      extractor: { plugin: 'regex_facet_extractor', config: {} },
      resolver: { plugin: 'dictionary_resolver', config: {} },
      comparator: { plugin: 'fingerprint_comparator', config: {} },
      ranking: {
        ingest: { enabled: false, backend: 'none', max_passage_chars: 4000 },
        search: { enabled: false, backend: 'none', rerank: true }
      },
      decider: { plugin: 'rules_decider', config: {} },
      merger: { plugin: 'patch_to_mutations', config: {} }
    },
    storage: {
      committer: { plugin: 'd1_committer', config: { database: 'DB' } },
      artifacts: { kind: 'r2', bucket: 'ARTIFACTS', prefix: 'delta-curator/' }
    }
  };
  
  const existing = await readConfig(env, seedConfig.project_id);
  if (existing.config && canonicalJson(existing.config) === canonicalJson(seedConfig)) {
    return { success: true, projectId: seedConfig.project_id };
  }
  
  const result = await writeConfig(env, seedConfig, true);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  
  return { success: true, projectId: result.projectId };
}

// ============================================================================
// Route Handlers
// ============================================================================

async function handleConfigListRoute(env: Env): Promise<Response> {
  const result = await listConfigs(env);
  if (result.error) {
    return new Response(JSON.stringify({ error: result.error }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  return new Response(JSON.stringify({ configs: result.configs }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleConfigGetRoute(env: Env, request: Request, projectId: string): Promise<Response> {
  const url = new URL(request.url);
  const version = url.searchParams.get('version');
  
  const result = version 
    ? await readConfigVersion(env, projectId, version)
    : await readConfig(env, projectId);
  
  if (result.error) {
    const status = result.error.includes('not found') ? 404 : 500;
    return new Response(JSON.stringify({ error: result.error }), { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  return new Response(JSON.stringify({ config: result.config, index: result.index }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleConfigWriteRoute(env: Env, request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const activate = url.searchParams.get('activate') === 'true';
    
    const body = await request.json();
    const result = await writeConfig(env, body, activate);
    
    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      project_id: result.projectId,
      version: result.version,
      r2_key: result.r2Key,
      hash: result.hash,
      active: activate
    }), { 
      status: 201,
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}

async function handleConfigActivateRoute(env: Env, request: Request, projectId: string): Promise<Response> {
  const url = new URL(request.url);
  const version = url.searchParams.get('version') || undefined;
  
  const result = await setActiveConfig(env, projectId, version);
  
  if (!result.success) {
    const status = result.error?.includes('not found') ? 404 : 500;
    return new Response(JSON.stringify({ error: result.error }), { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  return new Response(JSON.stringify({ success: true, project_id: projectId, version }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleConfigDeleteRoute(env: Env, projectId: string, version: string): Promise<Response> {
  const result = await deleteConfig(env, projectId, version);
  
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  return new Response(JSON.stringify({ success: true, project_id: projectId, version }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleConfigActiveRoute(env: Env): Promise<Response> {
  const result = await getActiveConfig(env);
  
  if (result.error) {
    const status = result.error.includes('not found') ? 404 : 500;
    return new Response(JSON.stringify({ error: result.error }), { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  return new Response(JSON.stringify({ config: result.config, index: result.index }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleSeedRoute(env: Env): Promise<Response> {
  const result = await seedConfig(env);
  
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  return new Response(JSON.stringify({ 
    success: true, 
    project_id: result.projectId,
    already_exists: false 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleRunRoute(env: Env, request: Request): Promise<Response> {
  // Stub - implement with actual Runner
  return new Response(JSON.stringify({ 
    commit_id: null, 
    items_processed: 0, 
    events_written: 0,
    trace_id: 'stub-trace'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleInspectRoute(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const since = url.searchParams.get('since') || 'PT24H';
  const format = url.searchParams.get('format') || 'markdown';
  
  const markdown = `# Delta-Curator Digest

## Summary
- No events since ${since}

---
Generated at ${new Date().toISOString()}
`;
  
  if (format === 'json') {
    return new Response(JSON.stringify({ markdown }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown' }
  });
}

async function handleSearchRoute(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const k = parseInt(url.searchParams.get('k') || '20');
  const rerank = url.searchParams.get('rerank') === 'true';
  
  return new Response(JSON.stringify({ 
    query: q, 
    k, 
    rerank, 
    docs: [], 
    total: 0, 
    took_ms: 0 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleHealthRoute(env: Env): Promise<Response> {
  try {
    const lastCommit = await env.DB.prepare('SELECT commit_id FROM commits ORDER BY rowid DESC LIMIT 1').first<{ commit_id: string }>();
    return new Response(JSON.stringify({ 
      ok: true, 
      version: '0.1.0', 
      last_commit_id: lastCommit?.commit_id 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ 
      ok: false, 
      error: String(err) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================================
// Database Initialization
// ============================================================================

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS commits (
  commit_id TEXT PRIMARY KEY,
  commit_key TEXT NOT NULL UNIQUE,
  trace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  old_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commits_source_trace ON commits(source_id, trace_id);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  candidate_seq INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY (commit_id) REFERENCES commits(commit_id)
);
CREATE INDEX IF NOT EXISTS idx_events_source_item ON events(source_id, source_item_id);
CREATE INDEX IF NOT EXISTS idx_events_trace_seq ON events(trace_id, candidate_seq);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

CREATE TABLE IF NOT EXISTS artifacts (
  artifact_key TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (commit_id) REFERENCES commits(commit_id)
);
CREATE INDEX IF NOT EXISTS idx_artifacts_commit ON artifacts(commit_id);

CREATE TABLE IF NOT EXISTS source_state (
  source_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  last_commit_id TEXT NOT NULL,
  last_commit_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (last_commit_id) REFERENCES commits(commit_id)
);

CREATE TABLE IF NOT EXISTS facet_index (
  facet_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  facet_key TEXT NOT NULL,
  facet_value TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id)
);
CREATE INDEX IF NOT EXISTS idx_facet_key ON facet_index(facet_key);

CREATE TABLE IF NOT EXISTS fingerprint_index (
  fingerprint TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  first_event_id TEXT NOT NULL,
  FOREIGN KEY (first_event_id) REFERENCES events(event_id)
);
CREATE INDEX IF NOT EXISTS idx_fingerprint_payload ON fingerprint_index(payload_hash);

CREATE TABLE IF NOT EXISTS hold_index (
  hold_id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  reason TEXT,
  FOREIGN KEY (event_id) REFERENCES events(event_id)
);
CREATE INDEX IF NOT EXISTS idx_hold_source_item ON hold_index(source_item_id);

CREATE TABLE IF NOT EXISTS curated_docs (
  doc_id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  FOREIGN KEY (last_event_id) REFERENCES events(event_id)
);
CREATE INDEX IF NOT EXISTS idx_curated_source_item ON curated_docs(source_item_id);

CREATE TABLE IF NOT EXISTS project_configs (
  project_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  project_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_configs_active ON project_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_project_configs_updated ON project_configs(updated_at);
`;

async function handleInit(env: Env): Promise<Response> {
  try {
    // Execute schema statements one by one
    const statements = SCHEMA_DDL.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const stmt of statements) {
      try {
        await env.DB.prepare(stmt).run();
      } catch (e) {
        // Ignore "already exists" errors
        if (!String(e).includes('already exists')) {
          console.warn(`Statement failed: ${stmt.slice(0, 50)}... Error: ${e}`);
        }
      }
    }
    
    return new Response(JSON.stringify({ success: true, message: 'Database initialized' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================================
// Main Router
// ============================================================================

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();
  
  // Init route (development only - remove in production)
  if (pathname === '/init' && method === 'POST') {
    return handleInit(env);
  }
  
  // Auth routes
  if (pathname === '/api/auth/microsoft' && method === 'GET') {
    return handleMicrosoftLogin(request, env);
  }
  
  if (pathname === '/api/auth/microsoft/callback' && method === 'GET') {
    return handleMicrosoftCallback(request, env);
  }
  
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return handleLogout();
  }
  
  if (pathname === '/api/auth/me' && method === 'GET') {
    return handleMe(request, env);
  }
  
  // Config routes
  if (pathname === '/config' && method === 'GET') {
    return handleConfigListRoute(env);
  }
  
  if (pathname === '/config' && method === 'POST') {
    return handleConfigWriteRoute(env, request);
  }
  
  if (pathname === '/config/active' && method === 'GET') {
    return handleConfigActiveRoute(env);
  }
  
  if (pathname.startsWith('/config/') && pathname.includes('/activate') && method === 'POST') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return handleConfigActivateRoute(env, request, parts[1]);
    }
  }
  
  if (pathname.startsWith('/config/') && method === 'GET') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 2 && parts[1] !== 'active') {
      return handleConfigGetRoute(env, request, parts[1]);
    }
  }
  
  if (pathname.startsWith('/config/') && method === 'DELETE') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 3) {
      return handleConfigDeleteRoute(env, parts[1], parts[2]);
    }
  }
  
  // Operation routes
  if (pathname === '/seed' && method === 'POST') {
    return handleSeedRoute(env);
  }
  
  if (pathname === '/run' && method === 'POST') {
    return handleRunRoute(env, request);
  }
  
  if (pathname === '/inspect' && method === 'GET') {
    return handleInspectRoute(env, request);
  }
  
  if (pathname === '/search' && method === 'GET') {
    return handleSearchRoute(env, request);
  }
  
  if (pathname === '/health' && method === 'GET') {
    return handleHealthRoute(env);
  }
  
  return new Response(JSON.stringify({ error: 'Not found' }), { 
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ============================================================================
// Export
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handleCors(request, env);
    }
    
    const response = await handleRequest(request, env);
    return addCorsHeaders(response, request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Scheduled event triggered');
  }
};
