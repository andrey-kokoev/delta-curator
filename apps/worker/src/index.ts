/**
 * Delta-Curator Worker - API Only
 * Cloudflare Workers entrypoint with API handlers
 */

import type { Env } from './env';

// Inline route handlers to avoid bundling issues

// CORS handling
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

// Auth handlers
async function handleMicrosoftLogin(request: Request, env: Env): Promise<Response> {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
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
      'Set-Cookie': `dc_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
    }
  });
}

async function handleMicrosoftCallback(request: Request, env: Env): Promise<Response> {
  return new Response(JSON.stringify({ success: true }), { 
    headers: { 'Content-Type': 'application/json' } 
  });
}

function handleLogout(): Response {
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'dc_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' }
  });
}

async function handleMe(env: Env): Promise<Response> {
  return new Response(JSON.stringify({ id: '1', email: 'user@example.com', name: 'User', roles: ['user'] }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Config handlers
async function handleConfigList(env: Env): Promise<Response> {
  try {
    const result = await env.DB.prepare('SELECT * FROM project_configs ORDER BY updated_at DESC').all();
    return new Response(JSON.stringify({ configs: result.results || [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleConfigGet(request: Request, env: Env, projectId: string): Promise<Response> {
  return new Response(JSON.stringify({ error: 'Not implemented' }), { 
    status: 501,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleConfigWrite(request: Request, env: Env): Promise<Response> {
  return new Response(JSON.stringify({ error: 'Not implemented' }), { 
    status: 501,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleSeed(env: Env): Promise<Response> {
  return new Response(JSON.stringify({ success: true, message: 'Seed endpoint' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Operation handlers
async function handleRun(request: Request, env: Env): Promise<Response> {
  return new Response(JSON.stringify({ commit_id: null, items_processed: 0, events_written: 0 }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleInspect(request: Request, env: Env): Promise<Response> {
  const since = new URL(request.url).searchParams.get('since') || 'PT24H';
  return new Response(`# Delta-Curator Digest\n\nNo events since ${since}`, {
    headers: { 'Content-Type': 'text/markdown' }
  });
}

async function handleSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  return new Response(JSON.stringify({ query: q, k: 20, rerank: true, docs: [], total: 0, took_ms: 0 }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleHealth(env: Env): Promise<Response> {
  try {
    const lastCommit = await env.DB.prepare('SELECT commit_id FROM commits ORDER BY rowid DESC LIMIT 1').first<{ commit_id: string }>();
    return new Response(JSON.stringify({ ok: true, version: '0.1.0', last_commit_id: lastCommit?.commit_id }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Main router
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();
  
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
    return handleMe(env);
  }
  
  // Config routes
  if (pathname === '/config' && method === 'GET') {
    return handleConfigList(env);
  }
  
  if (pathname === '/config' && method === 'POST') {
    return handleConfigWrite(request, env);
  }
  
  if (pathname.startsWith('/config/') && method === 'GET') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return handleConfigGet(request, env, parts[1]);
    }
  }
  
  // Operation routes
  if (pathname === '/seed' && method === 'POST') {
    return handleSeed(env);
  }
  
  if (pathname === '/run' && method === 'POST') {
    return handleRun(request, env);
  }
  
  if (pathname === '/inspect' && method === 'GET') {
    return handleInspect(request, env);
  }
  
  if (pathname === '/search' && method === 'GET') {
    return handleSearch(request, env);
  }
  
  if (pathname === '/health' && method === 'GET') {
    return handleHealth(env);
  }
  
  return new Response(JSON.stringify({ error: 'Not found' }), { 
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}

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
