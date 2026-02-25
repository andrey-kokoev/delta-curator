/**
 * Delta-Curator Worker - Full API Implementation
 * Cloudflare Workers entrypoint with complete API handlers
 */

import type { Env } from './env';
import type { ProjectConfig, ProjectConfigIndex } from '@delta-curator/protocol';
import { WorkersAIRanker } from '@delta-curator/plugin-ranker-workers-ai';
import { RSSSource } from './sources/rss';
import { FingerprintComparator, RulesDecider, SimpleMerger } from './plugins';

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
// Auth - Admin Token (Bearer)
// ============================================================================

async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  try {
    // Check required environment variables
    if (!env.ADMIN_TOKEN) {
      console.error('ADMIN_TOKEN environment variable is not set');
      return new Response(JSON.stringify({ error: 'Server configuration error: ADMIN_TOKEN not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!env.AUTH_SECRET) {
      console.error('AUTH_SECRET environment variable is not set');
      return new Response(JSON.stringify({ error: 'Server configuration error: AUTH_SECRET not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json() as { token?: string };
    const providedToken = body.token;
    
    if (!providedToken) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (providedToken !== env.ADMIN_TOKEN) {
      console.warn(`Invalid admin token provided: ${providedToken.slice(0, 10)}...`);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create admin user session
    const user: User = {
      id: 'admin',
      email: 'admin@delta-curator.local',
      name: 'Administrator',
      roles: ['admin']
    };
    
    const session: Session = {
      user,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    
    const token = await signSession(session, env.AUTH_SECRET);
    
    const response = new Response(JSON.stringify({ 
      success: true, 
      user,
      token // Return token for localStorage storage
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    return setSessionCookie(response, token);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Login failed: ' + (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleAdminTokenAuth(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Bearer token required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const providedToken = authHeader.slice(7); // Remove 'Bearer ' prefix
    
    if (providedToken !== env.ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create admin user session
    const user: User = {
      id: 'admin',
      email: 'admin@delta-curator.local',
      name: 'Administrator',
      roles: ['admin']
    };
    
    const session: Session = {
      user,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    
    const token = await signSession(session, env.AUTH_SECRET);
    
    return new Response(JSON.stringify({ 
      success: true, 
      user,
      token
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Auth failed: ' + (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function isAdminRequest(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7) === env.ADMIN_TOKEN;
  }

  const session = await getSession(request, env);
  return Boolean(session?.user?.roles?.includes('admin'));
}

// ============================================================================
// Config Store Implementation
// ============================================================================

function computeHash(content: string): string {
  // Simple hash - in production use proper SHA-256
  return Array.from(content).reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0).toString(16);
}

const INTERNAL_CONFIG_REVISION = '1';

function generateR2Key(projectId: string, prefix = 'configs/'): string {
  return `${prefix}${projectId}.json`;
}

function canonicalJson(obj: unknown): string {
  // Recursively sort keys for canonical JSON representation
  const sortKeys = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(sortKeys);
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  };
  return JSON.stringify(sortKeys(obj));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function sha256Base64(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToBase64(new Uint8Array(digest)).replace(/=+$/g, '');
}

function buildRerankPassage(payload: unknown, maxChars: number): string {
  const doc = (payload ?? {}) as Record<string, unknown>;
  const title = String(doc.title ?? '').trim();
  const body = String(doc.description ?? doc.summary ?? doc.content ?? '').trim();
  const facets = Array.isArray(doc.facets)
    ? doc.facets
      .map((facet) => {
        if (!facet || typeof facet !== 'object') return '';
        const typed = facet as Record<string, unknown>;
        const key = String(typed.type ?? typed.key ?? '').trim();
        const value = String(typed.value ?? '').trim();
        return `${key}:${value}`;
      })
      .filter(Boolean)
      .join(', ')
    : '';

  const text = [title, body.slice(0, maxChars), facets ? `facets: ${facets}` : '']
    .filter(Boolean)
    .join('\n');

  return text.slice(0, maxChars);
}

async function getTableColumns(env: Env, table: 'commits' | 'source_state' | 'curated_docs'): Promise<Set<string>> {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set((results ?? []).map((row) => row.name));
}

async function upsertSourceState(
  env: Env,
  columns: Set<string>,
  sourceId: string,
  state: unknown,
  now: string,
  commitInfo?: { commitId: string; commitKey: string }
): Promise<void> {
  const stateJson = JSON.stringify(state);

  if (columns.has('last_commit_id') && columns.has('last_commit_key')) {
    if (commitInfo) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO source_state
         (source_id, state, last_commit_id, last_commit_key, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        sourceId,
        stateJson,
        commitInfo.commitId,
        commitInfo.commitKey,
        now
      ).run();
      return;
    }

    const existing = await env.DB.prepare(
      `SELECT source_id FROM source_state WHERE source_id = ?`
    ).bind(sourceId).first();

    if (existing) {
      await env.DB.prepare(
        `UPDATE source_state
         SET state = ?, updated_at = ?
         WHERE source_id = ?`
      ).bind(
        stateJson,
        now,
        sourceId
      ).run();
    }
    return;
  }

  await env.DB.prepare(
    `INSERT INTO source_state (source_id, state, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       state = excluded.state,
       updated_at = excluded.updated_at`
  ).bind(
    sourceId,
    stateJson,
    now
  ).run();
}

async function ensureCursorCommit(
  env: Env,
  commitColumns: Set<string>,
  sourceId: string,
  traceId: string,
  oldState: unknown,
  newState: unknown,
  now: string,
  itemIds: string[]
): Promise<{ commitId: string; commitKey: string }> {
  const oldStateJson = JSON.stringify(oldState ?? {});
  const newStateJson = JSON.stringify(newState ?? {});
  const commitKey = await sha256Base64(
    `${sourceId}:${oldStateJson}:${itemIds.sort().join('|')}`
  );

  if (
    commitColumns.has('commit_key') &&
    commitColumns.has('old_state') &&
    commitColumns.has('new_state')
  ) {
    const existing = await env.DB.prepare(
      'SELECT commit_id FROM commits WHERE commit_key = ?'
    ).bind(commitKey).first<{ commit_id: string }>();

    if (existing?.commit_id) {
      return { commitId: existing.commit_id, commitKey };
    }

    const commitId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO commits
       (commit_id, commit_key, trace_id, source_id, old_state, new_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      commitId,
      commitKey,
      traceId,
      sourceId,
      oldStateJson,
      newStateJson,
      now
    ).run();

    return { commitId, commitKey };
  }

  const commitId = crypto.randomUUID();
  if (commitColumns.has('source_state')) {
    await env.DB.prepare(
      `INSERT INTO commits
       (commit_id, trace_id, source_id, source_state, item_count, event_count, committed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      commitId,
      traceId,
      sourceId,
      newStateJson,
      itemIds.length,
      0,
      now
    ).run();

    return { commitId, commitKey };
  }

  throw new Error('Unsupported commits table schema');
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
  const projectName = validConfig.project_name;
  const now = new Date().toISOString();
  
  const content = canonicalJson(validConfig);
  const hash = computeHash(content);
  const r2Key = generateR2Key(projectId);
  
  try {
    if (isActive) {
      await env.DB.prepare(
        `UPDATE project_configs
         SET is_active = 0,
             updated_at = ?
         WHERE is_active = 1`
      ).bind(now).run();
    }

    // Write to R2 first
    await env.ARTIFACTS.put(r2Key, content, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { 'project-id': projectId, version: INTERNAL_CONFIG_REVISION, hash }
    });
    
    // Write to D1
    await env.DB.prepare(
      `INSERT OR REPLACE INTO project_configs
       (project_id, version, project_name, is_active, r2_key, hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      projectId,
      INTERNAL_CONFIG_REVISION,
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

async function normalizeActiveProjectState(env: Env): Promise<void> {
  const activeRows = await env.DB.prepare(
    `SELECT project_id, version
     FROM project_configs
     WHERE is_active = 1
     ORDER BY updated_at DESC`
  ).all<{ project_id: string; version: string }>();

  let winner: { project_id: string; version: string } | null = null;
  if ((activeRows.results || []).length > 0) {
    winner = activeRows.results![0];
  } else {
    winner = await env.DB.prepare(
      `SELECT project_id, version
       FROM project_configs
       ORDER BY updated_at DESC
       LIMIT 1`
    ).first<{ project_id: string; version: string }>();
  }

  if (!winner) {
    return;
  }

  const needsNormalize = (activeRows.results || []).length !== 1 ||
    activeRows.results![0]?.project_id !== winner.project_id ||
    activeRows.results![0]?.version !== winner.version;

  if (!needsNormalize) {
    return;
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE project_configs
     SET is_active = 0,
         updated_at = ?`
  ).bind(now).run();

  await env.DB.prepare(
    `UPDATE project_configs
     SET is_active = 1,
         updated_at = ?
     WHERE project_id = ? AND version = ?`
  ).bind(now, winner.project_id, winner.version).run();
}

async function listConfigs(env: Env): Promise<{ configs: ProjectConfigIndex[]; error?: string }> {
  try {
    await normalizeActiveProjectState(env);

    const result = await env.DB.prepare(
      'SELECT * FROM project_configs ORDER BY updated_at DESC'
    ).all<ProjectConfigIndex>();
    
    return { configs: result.results || [] };
  } catch (err) {
    return { configs: [], error: `Failed to list configs: ${err}` };
  }
}

async function setActiveConfig(env: Env, projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();

    const target = await env.DB.prepare(
      `SELECT project_id, version
       FROM project_configs
       WHERE project_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    ).bind(projectId).first<{ project_id: string; version: string }>();

    if (!target) {
      return { success: false, error: `Project not found: ${projectId}` };
    }

    await env.DB.prepare(
      `UPDATE project_configs
       SET is_active = 0,
           updated_at = ?
       WHERE is_active = 1`
    ).bind(now).run();

    await env.DB.prepare(
      `UPDATE project_configs
       SET is_active = 1,
           updated_at = ?
       WHERE project_id = ? AND version = ?`
    ).bind(now, target.project_id, target.version).run();
    
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to set active: ${err}` };
  }
}

async function getActiveConfig(env: Env): Promise<{ config?: ProjectConfig; index?: ProjectConfigIndex; error?: string }> {
  try {
    await normalizeActiveProjectState(env);

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

async function deleteConfig(env: Env, projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const r2Key = generateR2Key(projectId);

    const deletingRow = await env.DB.prepare(
      'SELECT is_active, version FROM project_configs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1'
    ).bind(projectId).first<{ is_active: number; version: string }>();

    if (!deletingRow) {
      return { success: false, error: `Config not found for ${projectId}` };
    }
    
    await env.DB.prepare(
      'DELETE FROM project_configs WHERE project_id = ?'
    ).bind(projectId).run();

    if (deletingRow.is_active === 1) {
      const fallback = await env.DB.prepare(
        `SELECT project_id, version
         FROM project_configs
         ORDER BY updated_at DESC
         LIMIT 1`
      ).first<{ project_id: string; version: string }>();

      if (fallback) {
        const now = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE project_configs
           SET is_active = 0,
               updated_at = ?
           WHERE is_active = 1`
        ).bind(now).run();

        await env.DB.prepare(
          `UPDATE project_configs
           SET is_active = 1,
               updated_at = ?
           WHERE project_id = ? AND version = ?`
        ).bind(now, fallback.project_id, fallback.version).run();
      }
    }
    
    await env.ARTIFACTS.delete(r2Key);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete: ${err}` };
  }
}

async function seedConfig(env: Env): Promise<{ success: boolean; projectId?: string; error?: string }> {
  const seedConfig: ProjectConfig = {
    project_id: 'quickstart-demo',
    project_name: 'Quickstart Demo Project',
    topic: { id: 'demo-topic-v0', label: 'Example topic for demonstration' },
    sources: [{
      id: 'demo-rss-source',
      plugin: 'rss_source',
      enabled: true,
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
  const result = await readConfig(env, projectId);
  
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

async function handleConfigActivateRoute(env: Env, projectId: string): Promise<Response> {
  const result = await setActiveConfig(env, projectId);
  
  if (!result.success) {
    const status = result.error?.includes('not found') ? 404 : 500;
    return new Response(JSON.stringify({ error: result.error }), { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  return new Response(JSON.stringify({ success: true, project_id: projectId }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleConfigDeleteRoute(env: Env, projectId: string): Promise<Response> {
  const result = await deleteConfig(env, projectId);
  
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
  
  return new Response(JSON.stringify({ success: true, project_id: projectId }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleSourceCursorUpdateRoute(env: Env, request: Request): Promise<Response> {
  const hasAdminAccess = await isAdminRequest(request, env);
  const session = await getSession(request, env);
  const hasSessionAccess = Boolean(session?.user);

  if (!hasAdminAccess && !hasSessionAccess) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as {
      project_id?: string;
      source_id?: string;
      cursor_published_at?: string | null;
      clear_recent_guids?: boolean;
    };

    const sourceId = (body.source_id || '').trim();
    if (!sourceId) {
      return new Response(JSON.stringify({ error: 'source_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cursorPublishedAt = body.cursor_published_at ?? null;
    if (cursorPublishedAt !== null && Number.isNaN(Date.parse(cursorPublishedAt))) {
      return new Response(JSON.stringify({ error: 'cursor_published_at must be valid ISO datetime or null' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const projectId = (body.project_id || '').trim();
    if (!projectId) {
      return new Response(JSON.stringify({ error: 'project_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const configResult = await readConfig(env, projectId);
    if (configResult.error || !configResult.config) {
      return new Response(JSON.stringify({ error: configResult.error || `Unknown project_id: ${projectId}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const sourceExists = configResult.config.sources.some((source) => source.id === sourceId);
    if (!sourceExists) {
      return new Response(JSON.stringify({
        error: `Unknown source_id: ${sourceId}`,
        available_sources: configResult.config.sources.map((source) => source.id)
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = new Date().toISOString();
    const existingStateRow = await env.DB.prepare(
      'SELECT state FROM source_state WHERE source_id = ?'
    ).bind(sourceId).first<{ state: string }>();

    let oldState: Record<string, unknown> = {};
    try {
      oldState = existingStateRow?.state ? JSON.parse(existingStateRow.state) : {};
    } catch {
      oldState = {};
    }

    const newState: Record<string, unknown> = {
      ...oldState,
      lastFetch: now
    };

    if (cursorPublishedAt === null) {
      delete newState.cursorPublishedAt;
    } else {
      newState.cursorPublishedAt = new Date(cursorPublishedAt).toISOString();
    }

    if (body.clear_recent_guids ?? true) {
      newState.cursorIds = [];
      newState.recentIds = [];
      newState.recentGuids = [];
      newState.processedGuids = [];
    }

    const traceId = crypto.randomUUID();
    const commitColumns = await getTableColumns(env, 'commits');
    const sourceStateColumns = await getTableColumns(env, 'source_state');
    const cursorCommit = await ensureCursorCommit(
      env,
      commitColumns,
      sourceId,
      traceId,
      oldState,
      newState,
      now,
      [`cursor-update:${sourceId}:${newState.cursorPublishedAt ?? 'null'}`]
    );

    await upsertSourceState(
      env,
      sourceStateColumns,
      sourceId,
      newState,
      now,
      { commitId: cursorCommit.commitId, commitKey: cursorCommit.commitKey }
    );

    return new Response(JSON.stringify({
      success: true,
      project_id: configResult.config.project_id,
      source_id: sourceId,
      cursor_published_at: (newState.cursorPublishedAt as string | undefined) ?? null,
      recent_guids_count: Array.isArray(newState.recentGuids) ? newState.recentGuids.length : 0,
      commit_id: cursorCommit.commitId,
      trace_id: traceId
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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
  const startTime = Date.now();
  const url = new URL(request.url);
  let body: {
    source_id?: string;
    max_items?: number;
    project_id?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const sourceId = (body.source_id || url.searchParams.get('source_id') || '').trim() || null;
  const bodyMaxItems = Number.isFinite(Number(body.max_items)) ? Number(body.max_items) : null;
  const maxItems = Math.max(
    1,
    Math.min(
      bodyMaxItems ?? parseInt(url.searchParams.get('max_items') || '10', 10),
      500
    )
  );
  const projectId = (body.project_id || url.searchParams.get('project_id') || '').trim();

  if (!projectId) {
    return new Response(JSON.stringify({ error: 'project_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Get scoped config
  const configResult = await readConfig(env, projectId);
  if (configResult.error || !configResult.config) {
    return new Response(JSON.stringify({ error: configResult.error || `Unknown project_id: ${projectId}` }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const config = configResult.config;

  const isSourceEnabled = (source: { enabled?: boolean }) => source.enabled !== false;
  const enabledSources = config.sources.filter(isSourceEnabled);

  if (enabledSources.length === 0) {
    return new Response(JSON.stringify({
      error: 'No enabled sources found for this project',
      available_sources: config.sources.map((s) => ({
        id: s.id,
        enabled: isSourceEnabled(s)
      }))
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Find source config
  const sourceConfig = enabledSources.find((s) => 
    sourceId ? s.id === sourceId : true
  );

  const requestedSource = sourceId
    ? config.sources.find((s) => s.id === sourceId)
    : null;

  if (sourceId && requestedSource && !isSourceEnabled(requestedSource)) {
    return new Response(JSON.stringify({
      error: `Source is paused: ${sourceId}`,
      source_id: sourceId,
      project_id: config.project_id
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!sourceConfig) {
    return new Response(JSON.stringify({ 
      error: 'No source found',
      available_sources: enabledSources.map((s) => s.id)
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Create source based on plugin type
  let source;
  const pluginType = sourceConfig.plugin;
  const sourceConfigData = (sourceConfig.config || {}) as Record<string, unknown>;
  
  if (pluginType === 'rss_source' || pluginType === 'rss' || pluginType === 'hacker-news') {
    source = new RSSSource({
      feed_url: (sourceConfigData.feed_url as string) || 'https://hnrss.org/frontpage',
      user_agent: 'Delta-Curator/1.0'
    });
  } else {
    return new Response(JSON.stringify({ 
      error: `Unsupported source plugin: ${pluginType}` 
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Create plugins
  const comparator = new FingerprintComparator();
  const decider = new RulesDecider();
  
  // Generate trace ID
  const traceId = crypto.randomUUID();
  
  try {
    const commitColumns = await getTableColumns(env, 'commits');
    const sourceStateColumns = await getTableColumns(env, 'source_state');
    const curatedDocColumns = await getTableColumns(env, 'curated_docs');

    // Get source state
    const { results: stateResults } = await env.DB.prepare(
      'SELECT state FROM source_state WHERE source_id = ?'
    ).bind(sourceConfig.id).all<{ state: string }>();
    
    const sourceState = stateResults[0]?.state ? JSON.parse(stateResults[0].state) : {};
    
    // Read batch from source
    const batchResult = await source.readBatch(sourceState, maxItems);
    
    if (!batchResult) {
      return new Response(JSON.stringify({ 
        commit_id: null,
        trace_id: traceId,
        items_processed: 0,
        events_written: 0,
        message: 'No new items to process'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const items = batchResult.items;

    const ingestRanking = config.pipeline?.ranking?.ingest;
    const rankingEnabled = Boolean(
      ingestRanking?.enabled &&
      ingestRanking?.backend === 'workers_ai_rerank' &&
      env.AI
    );
    const rankingQuery = typeof ingestRanking?.query === 'string' && ingestRanking.query.trim().length > 0
      ? ingestRanking.query.trim()
      : (config.topic?.label || '').trim();
    const rankingModel = typeof ingestRanking?.model === 'string' && ingestRanking.model.trim().length > 0
      ? ingestRanking.model.trim()
      : '@cf/baai/bge-reranker-base';
    const rankingMaxPassageChars = Number.isInteger(ingestRanking?.max_passage_chars)
      ? Math.max(256, Math.min(Number(ingestRanking?.max_passage_chars), 12000))
      : 4000;
    const rankingThreshold = 0.2;
    const rankScoresByItem = new Map<string, number>();

    if (rankingEnabled && rankingQuery) {
      const ranker = new WorkersAIRanker(env.AI, rankingQuery, rankingModel, rankingMaxPassageChars);
      const passages = items.map((item) => ({
        id: item.source_item_id,
        text: buildRerankPassage(item.payload, rankingMaxPassageChars)
      }));
      const scores = await ranker.score(passages);
      for (const score of scores) {
        rankScoresByItem.set(score.id, score.score);
      }
    }
    
    // Process each item
    const events: any[] = [];
    const now = new Date().toISOString();
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const payload = item.payload as Record<string, unknown>;
      
      // Generate event ID (simplified - should use proper dual-hash)
      const eventId = await sha256Base64(`${item.source_item_id}:${canonicalJson(payload)}`);
      
      // Check for existing event
      const existing = await env.DB.prepare(
        'SELECT event_id FROM events WHERE event_id = ?'
      ).bind(eventId).first();
      
      if (existing) {
        continue; // Skip duplicate
      }

      if (rankingEnabled && rankingQuery) {
        const rankScore = rankScoresByItem.get(item.source_item_id) ?? 0;
        if (rankScore < rankingThreshold) {
          continue;
        }
      }
      
      // Prepare candidate doc
      const candidateDoc = {
        trace_id: traceId,
        source_item_id: item.source_item_id,
        candidate_seq: i,
        observed_at: now,
        payload: item.payload
      };
      
      // Get fingerprints for comparison
      const { results: fingerprints } = await env.DB.prepare(
        'SELECT fingerprint as payload_hash, first_event_id as event_id FROM fingerprint_index LIMIT 1000'
      ).all<{ payload_hash: string; event_id: string }>();
      
      // Build base views
      const baseViews = [{
        viewName: 'fingerprint_index',
        state: { fingerprints: fingerprints || [] }
      }];
      
      // Compare with existing documents
      const compareResult = await comparator.compare(candidateDoc, baseViews);
      
      // Make decision
      const decision = await decider.decide(candidateDoc, compareResult);
      
      // Only process if append (accept)
      if (decision.decision !== 'append') {
        continue;
      }
      
      // Create event
      const payloadHash = await sha256Base64(canonicalJson(item.payload));
      const event = {
        event_type: 'doc_observed',
        event_version: '1.0',
        event_id: eventId,
        payload_hash: payloadHash,
        hash_alg: 'dc-v1-semcore' as const,
        trace_id: traceId,
        source_id: sourceConfig.id,
        source_item_id: item.source_item_id,
        candidate_seq: i,
        observed_at: now,
        payload: item.payload
      };
      
      events.push(event);
    }
    
    if (events.length === 0) {
      // Update source state even if no new events
      let cursorCommitId: string | null = null;
      if (sourceStateColumns.has('last_commit_id') && sourceStateColumns.has('last_commit_key')) {
        const cursorCommit = await ensureCursorCommit(
          env,
          commitColumns,
          sourceConfig.id,
          traceId,
          sourceState,
          batchResult.newState,
          now,
          items.map((item) => item.source_item_id)
        );
        cursorCommitId = cursorCommit.commitId;

        await upsertSourceState(
          env,
          sourceStateColumns,
          sourceConfig.id,
          batchResult.newState,
          now,
          { commitId: cursorCommit.commitId, commitKey: cursorCommit.commitKey }
        );
      } else {
        await upsertSourceState(
          env,
          sourceStateColumns,
          sourceConfig.id,
          batchResult.newState,
          now
        );
      }
      
      return new Response(JSON.stringify({ 
        commit_id: cursorCommitId,
        trace_id: traceId,
        items_processed: items.length,
        events_written: 0,
        message: 'No novel items to commit'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate commit ID
    const commitId = crypto.randomUUID();
    const oldStateJson = JSON.stringify(sourceState);
    const newStateJson = JSON.stringify(batchResult.newState);
    const commitKey = await sha256Base64(
      `${sourceConfig.id}:${oldStateJson}:${events.map((e) => e.source_item_id).join('|')}`
    );

    // Create commit record first (events has FK -> commits)
    if (commitColumns.has('source_state')) {
      await env.DB.prepare(
        `INSERT INTO commits 
         (commit_id, trace_id, source_id, source_state, item_count, event_count, committed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        commitId,
        traceId,
        sourceConfig.id,
        newStateJson,
        items.length,
        events.length,
        now
      ).run();
    } else if (
      commitColumns.has('commit_key') &&
      commitColumns.has('old_state') &&
      commitColumns.has('new_state')
    ) {
      await env.DB.prepare(
        `INSERT INTO commits
         (commit_id, commit_key, trace_id, source_id, old_state, new_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        commitId,
        commitKey,
        traceId,
        sourceConfig.id,
        oldStateJson,
        newStateJson,
        now
      ).run();
    } else {
      throw new Error('Unsupported commits table schema');
    }
    
    // Write events to D1
    for (const event of events) {
      await env.DB.prepare(
        `INSERT INTO events 
         (event_id, commit_id, event_type, event_version, payload_hash, trace_id, 
          source_id, source_item_id, candidate_seq, observed_at, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        event.event_id,
        commitId,
        event.event_type,
        event.event_version,
        event.payload_hash,
        event.trace_id,
        event.source_id,
        event.source_item_id,
        event.candidate_seq,
        event.observed_at,
        JSON.stringify(event.payload)
      ).run();
      
      // Index facets if present
      if (event.payload.facets) {
        for (const facet of event.payload.facets) {
          await env.DB.prepare(
            `INSERT INTO facet_index 
             (facet_id, event_id, facet_key, facet_value)
             VALUES (?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            event.event_id,
            facet.type || facet.key || 'facet',
            typeof facet.value === 'string' ? facet.value : JSON.stringify(facet.value ?? '')
          ).run();
        }
      }
      
      // Index fingerprint
      await env.DB.prepare(
        `INSERT OR IGNORE INTO fingerprint_index 
         (fingerprint, source_item_id, payload_hash, first_event_id)
         VALUES (?, ?, ?, ?)`
      ).bind(
        event.payload_hash,
        event.source_item_id,
        event.payload_hash,
        event.event_id
      ).run();
      
      // Add to curated_docs
      const payload = event.payload as any;
      const insertCuratedRich = () => env.DB.prepare(
        `INSERT INTO curated_docs 
         (doc_id, event_id, content_hash, rank_score, source_url, title, 
          summary, entities, published_at, fetched_at, held, held_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        event.event_id,
        event.payload_hash,
        0.5, // Default rank_score
        payload.link || payload.url || '',
        payload.title || 'Untitled',
        payload.description || '',
        JSON.stringify([]),
        payload.pubDate || now,
        now,
        0,
        null
      ).run();

      const insertCuratedLegacy = () => env.DB.prepare(
        `INSERT OR REPLACE INTO curated_docs
         (doc_id, source_item_id, payload, last_event_id)
         VALUES (?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        event.source_item_id,
        JSON.stringify(payload),
        event.event_id
      ).run();

      try {
        if (curatedDocColumns.has('event_id')) {
          await insertCuratedRich();
        } else {
          await insertCuratedLegacy();
        }
      } catch (err: any) {
        const message = String(err?.message || err);
        if (message.includes('no column named event_id')) {
          await insertCuratedLegacy();
        } else if (message.includes('no column named source_item_id')) {
          await insertCuratedRich();
        } else {
          throw err;
        }
      }
    }
    
    // Update source state
    await upsertSourceState(
      env,
      sourceStateColumns,
      sourceConfig.id,
      batchResult.newState,
      now,
      { commitId, commitKey }
    );
    
    return new Response(JSON.stringify({ 
      commit_id: commitId,
      trace_id: traceId,
      items_processed: items.length,
      events_written: events.length,
      project_id: config.project_id,
      source_id: sourceConfig.id,
      took_ms: Date.now() - startTime
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Run failed',
      trace_id: traceId
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleInspectRoute(env: Env, request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const since = url.searchParams.get('since') || 'PT24H';
    const format = url.searchParams.get('format') || 'markdown';
    const projectId = (url.searchParams.get('project_id') || '').trim();

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'project_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let scopedProjectId: string | null = null;
    let scopedSourceIds: string[] | null = null;

    const configResult = await readConfig(env, projectId);
    if (configResult.error || !configResult.config) {
      return new Response(JSON.stringify({ error: configResult.error || `Unknown project_id: ${projectId}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    scopedProjectId = configResult.config.project_id;
    scopedSourceIds = configResult.config.sources.map((source) => source.id);

    if (scopedSourceIds && scopedSourceIds.length === 0) {
      const markdown = [
        '# Delta-Curator Digest',
        '',
        '## Summary',
        `- Window: ${since}`,
        '- Sources tracked: 0',
        `- Project: ${scopedProjectId}`,
        '',
        '## Source Cursors',
        '- No source state found',
        '',
        '---',
        `Generated at ${new Date().toISOString()}`,
        ''
      ].join('\n');

      if (format === 'json') {
        return new Response(JSON.stringify({
          since,
          generated_at: new Date().toISOString(),
          project_id: scopedProjectId,
          sources: [],
          markdown
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(markdown, {
        headers: { 'Content-Type': 'text/markdown' }
      });
    }

    const stateRows = scopedSourceIds
      ? await env.DB.prepare(
        `SELECT source_id, state, updated_at
         FROM source_state
         WHERE source_id IN (${scopedSourceIds.map(() => '?').join(', ')})
         ORDER BY updated_at DESC`
      ).bind(...scopedSourceIds).all<{ source_id: string; state: string; updated_at: string }>()
      : await env.DB.prepare(
        `SELECT source_id, state, updated_at
         FROM source_state
         ORDER BY updated_at DESC`
      ).all<{ source_id: string; state: string; updated_at: string }>();

    const stateBySourceId = new Map((stateRows.results || []).map((row) => [row.source_id, row] as const));
    const sources = configResult.config.sources.map((source) => {
      const row = stateBySourceId.get(source.id);

      let parsedState: Record<string, unknown> = {};
      try {
        parsedState = row?.state ? JSON.parse(row.state) : {};
      } catch {
        parsedState = {};
      }

      const recentGuids = Array.isArray(parsedState.recentIds)
        ? parsedState.recentIds
        : Array.isArray(parsedState.recentGuids)
          ? parsedState.recentGuids
          : Array.isArray(parsedState.processedGuids)
            ? parsedState.processedGuids
            : [];

      return {
        source_id: source.id,
        enabled: source.enabled !== false,
        cursor_published_at: typeof parsedState.cursorPublishedAt === 'string' ? parsedState.cursorPublishedAt : null,
        last_fetch: typeof parsedState.lastFetch === 'string' ? parsedState.lastFetch : null,
        recent_guids_count: recentGuids.length,
        updated_at: row?.updated_at ?? null
      };
    });

    const markdownLines = [
      '# Delta-Curator Digest',
      '',
      '## Summary',
      `- Window: ${since}`,
      `- Sources tracked: ${sources.length}`,
      `- Project: ${scopedProjectId ?? 'all'}`,
      '',
      '## Source Cursors'
    ];

    if (sources.length === 0) {
      markdownLines.push('- No source state found');
    } else {
      for (const source of sources) {
        markdownLines.push(`- ${source.source_id}`);
        markdownLines.push(`  - status: ${source.enabled ? 'enabled' : 'paused'}`);
        markdownLines.push(`  - cursorPublishedAt: ${source.cursor_published_at ?? 'n/a'}`);
        markdownLines.push(`  - lastFetch: ${source.last_fetch ?? 'n/a'}`);
        markdownLines.push(`  - recentGuids: ${source.recent_guids_count}`);
        markdownLines.push(`  - stateUpdatedAt: ${source.updated_at ?? 'n/a'}`);
      }
    }

    markdownLines.push('');
    markdownLines.push('---');
    markdownLines.push(`Generated at ${new Date().toISOString()}`);

    const markdown = `${markdownLines.join('\n')}\n`;

    if (format === 'json') {
      return new Response(JSON.stringify({
        since,
        generated_at: new Date().toISOString(),
        project_id: scopedProjectId,
        sources,
        markdown
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(markdown, {
      headers: { 'Content-Type': 'text/markdown' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleSearchRoute(env: Env, request: Request): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const k = parseInt(url.searchParams.get('k') || '20', 10);
  const rerank = url.searchParams.get('rerank') === 'true';
  const projectId = (url.searchParams.get('project_id') || '').trim();
  const sourceId = (url.searchParams.get('source_id') || '').trim();
  
  try {
    if (!projectId) {
      return new Response(JSON.stringify({
        error: 'project_id is required',
        query: q,
        k,
        rerank,
        docs: [],
        total: 0,
        took_ms: Date.now() - startTime
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let allowedSourceIds: string[] | null = null;

    const configResult = await readConfig(env, projectId);
    if (configResult.error || !configResult.config) {
      return new Response(JSON.stringify({
        error: configResult.error || `Unknown project_id: ${projectId}`,
        query: q,
        k,
        rerank,
        docs: [],
        total: 0,
        took_ms: Date.now() - startTime
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    allowedSourceIds = configResult.config.sources.map((source) => source.id);
    if (sourceId) {
      if (!allowedSourceIds.includes(sourceId)) {
        return new Response(JSON.stringify({
          error: `source_id ${sourceId} is not part of project ${projectId}`,
          query: q,
          k,
          rerank,
          docs: [],
          total: 0,
          took_ms: Date.now() - startTime
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      allowedSourceIds = [sourceId];
    }

    if (allowedSourceIds && allowedSourceIds.length === 0) {
      return new Response(JSON.stringify({
        query: q,
        k,
        rerank,
        project_id: projectId || undefined,
        source_id: sourceId || undefined,
        docs: [],
        total: 0,
        took_ms: Date.now() - startTime
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const curatedDocColumns = await getTableColumns(env, 'curated_docs');
    let docs: any[] = [];
    const sourcePlaceholders = allowedSourceIds?.map(() => '?').join(', ') || '';

    const sourceFilterClause = allowedSourceIds
      ? ` AND e.source_id IN (${sourcePlaceholders})`
      : '';
    const sourceFilterBindings = allowedSourceIds ? [...allowedSourceIds] : [];
    
    if (curatedDocColumns.has('event_id')) {
      const richWhere = q
        ? `WHERE (cd.title LIKE ? OR cd.summary LIKE ? OR cd.source_url LIKE ?)`
        : 'WHERE 1=1';
      const richBindings: unknown[] = [];
      if (q) {
        richBindings.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      richBindings.push(...sourceFilterBindings);
      richBindings.push(k);

      const result = await env.DB.prepare(
        `SELECT
           cd.doc_id,
           COALESCE(e.source_item_id, cd.source_url, cd.doc_id) AS source_item_id,
           json_object(
             'title', cd.title,
             'summary', cd.summary,
             'source_url', cd.source_url,
             'rank_score', cd.rank_score,
             'published_at', cd.published_at,
             'fetched_at', cd.fetched_at,
             'held', cd.held,
             'held_until', cd.held_until,
             'entities', cd.entities
           ) AS payload,
           cd.event_id AS last_event_id,
           e.source_id
         FROM curated_docs cd
         LEFT JOIN events e ON e.event_id = cd.event_id
         ${richWhere}${sourceFilterClause}
         ORDER BY cd.rank_score DESC, cd.fetched_at DESC
         LIMIT ?`
      ).bind(...richBindings).all();

      docs = (result.results || []).map((row: any) => ({
        doc_id: row.doc_id,
        source_item_id: row.source_item_id,
        payload: row.payload,
        last_event_id: row.last_event_id,
        source_id: row.source_id
      }));
    } else {
      const legacyWhere = q
        ? `WHERE (json_extract(cd.payload, '$.title') LIKE ?
             OR json_extract(cd.payload, '$.description') LIKE ?
             OR cd.source_item_id LIKE ?)`
        : 'WHERE 1=1';
      const legacyBindings: unknown[] = [];
      if (q) {
        legacyBindings.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      legacyBindings.push(...sourceFilterBindings);
      legacyBindings.push(k);

      const result = await env.DB.prepare(
        `SELECT
           cd.doc_id,
           cd.source_item_id,
           cd.payload,
           cd.last_event_id,
           e.source_id
         FROM curated_docs cd
         LEFT JOIN events e ON e.event_id = cd.last_event_id
         ${legacyWhere}${sourceFilterClause}
         ORDER BY e.observed_at DESC
         LIMIT ?`
      ).bind(...legacyBindings).all();

      docs = (result.results || []).map((row: any) => ({
        doc_id: row.doc_id,
        source_item_id: row.source_item_id,
        payload: row.payload,
        last_event_id: row.last_event_id,
        source_id: row.source_id
      }));
    }
    
    const tookMs = Date.now() - startTime;
    
    return new Response(JSON.stringify({ 
      query: q, 
      k, 
      rerank, 
      project_id: projectId || undefined,
      source_id: sourceId || undefined,
      docs, 
      total: docs.length, 
      took_ms: tookMs 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ 
      error: `Search failed: ${err.message || err}`,
      query: q,
      k,
      rerank,
      docs: [],
      total: 0,
      took_ms: Date.now() - startTime
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleRunsRoute(env: Env, request: Request): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const projectId = (url.searchParams.get('project_id') || '').trim();
  const sourceId = (url.searchParams.get('source_id') || '').trim();
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 50));

  if (!projectId) {
    return new Response(JSON.stringify({
      error: 'project_id is required',
      runs: [],
      total: 0,
      took_ms: Date.now() - startTime
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const configResult = await readConfig(env, projectId);
    if (configResult.error || !configResult.config) {
      return new Response(JSON.stringify({
        error: configResult.error || `Unknown project_id: ${projectId}`,
        runs: [],
        total: 0,
        took_ms: Date.now() - startTime
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let allowedSourceIds = configResult.config.sources.map((source) => source.id);
    if (sourceId) {
      if (!allowedSourceIds.includes(sourceId)) {
        return new Response(JSON.stringify({
          error: `source_id ${sourceId} is not part of project ${projectId}`,
          runs: [],
          total: 0,
          took_ms: Date.now() - startTime
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      allowedSourceIds = [sourceId];
    }

    if (allowedSourceIds.length === 0) {
      return new Response(JSON.stringify({
        project_id: projectId,
        source_id: sourceId || undefined,
        limit,
        runs: [],
        total: 0,
        took_ms: Date.now() - startTime
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const commitColumns = await getTableColumns(env, 'commits');
    const runAtExpression = commitColumns.has('committed_at')
      ? 'c.committed_at'
      : commitColumns.has('created_at')
        ? 'c.created_at'
        : 'NULL';
    const itemCountExpression = commitColumns.has('item_count') ? 'c.item_count' : 'NULL';
    const eventCountExpression = commitColumns.has('event_count') ? 'c.event_count' : 'NULL';

    const placeholders = allowedSourceIds.map(() => '?').join(', ');
    const query = `
      SELECT
        c.commit_id,
        c.trace_id,
        c.source_id,
        ${itemCountExpression} AS item_count,
        ${eventCountExpression} AS event_count,
        ${runAtExpression} AS run_at
      FROM commits c
      WHERE c.source_id IN (${placeholders})
      ORDER BY ${runAtExpression === 'NULL' ? 'c.rowid' : 'run_at'} DESC
      LIMIT ?`;

    const { results } = await env.DB.prepare(query)
      .bind(...allowedSourceIds, limit)
      .all<{
        commit_id: string;
        trace_id: string;
        source_id: string;
        item_count: number | null;
        event_count: number | null;
        run_at: string | null;
      }>();

    const runs = (results || []).map((row) => ({
      commit_id: row.commit_id,
      trace_id: row.trace_id,
      source_id: row.source_id,
      item_count: typeof row.item_count === 'number' ? row.item_count : null,
      event_count: typeof row.event_count === 'number' ? row.event_count : null,
      run_at: row.run_at
    }));

    return new Response(JSON.stringify({
      project_id: projectId,
      source_id: sourceId || undefined,
      limit,
      runs,
      total: runs.length,
      took_ms: Date.now() - startTime
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: `Runs query failed: ${err?.message || String(err)}`,
      runs: [],
      total: 0,
      took_ms: Date.now() - startTime
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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
  trace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_state TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  committed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commits_source_trace ON commits(source_id, trace_id);
CREATE INDEX IF NOT EXISTS idx_commits_time ON commits(committed_at);

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
  updated_at TEXT NOT NULL
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
  event_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  rank_score REAL NOT NULL DEFAULT 0,
  source_url TEXT,
  title TEXT,
  summary TEXT,
  entities TEXT, -- JSON array
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  held INTEGER NOT NULL DEFAULT 0,
  held_until TEXT,
  FOREIGN KEY (event_id) REFERENCES events(event_id)
);
CREATE INDEX IF NOT EXISTS idx_curated_event ON curated_docs(event_id);
CREATE INDEX IF NOT EXISTS idx_curated_rank ON curated_docs(rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_curated_held ON curated_docs(held, held_until);

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
  
  // Admin auth routes
  if (pathname === '/api/auth/admin' && method === 'POST') {
    return handleAdminLogin(request, env);
  }
  
  if (pathname === '/api/auth/admin/token' && method === 'POST') {
    return handleAdminTokenAuth(request, env);
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

  if (pathname === '/sources/cursor' && method === 'POST') {
    return handleSourceCursorUpdateRoute(env, request);
  }
  
  if (pathname.startsWith('/config/') && pathname.includes('/activate') && method === 'POST') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return handleConfigActivateRoute(env, parts[1]);
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
    if (parts.length === 2) {
      return handleConfigDeleteRoute(env, parts[1]);
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

  if (pathname === '/runs' && method === 'GET') {
    return handleRunsRoute(env, request);
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
