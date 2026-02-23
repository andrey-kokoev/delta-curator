/**
 * Delta-Curator Worker
 * Serves API and UI (Vue.js SPA)
 */

import type { Env } from './env';

// Simple API handlers inline
async function handleHealth(env: Env): Promise<Response> {
  try {
    const lastCommit = await env.DB
      .prepare('SELECT commit_id FROM commits ORDER BY rowid DESC LIMIT 1')
      .first<{ commit_id: string }>();
    
    return new Response(JSON.stringify({
      ok: true,
      version: '0.1.0',
      last_commit_id: lastCommit?.commit_id
    }), { headers: { 'Content-Type': 'application/json' }});
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleConfigList(env: Env): Promise<Response> {
  try {
    const result = await env.DB
      .prepare('SELECT * FROM project_configs ORDER BY updated_at DESC')
      .all();
    return new Response(JSON.stringify({ configs: result.results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleSeed(env: Env): Promise<Response> {
  // Minimal seed - just create a basic config
  return new Response(JSON.stringify({ success: true, message: 'Seed endpoint - implement with ConfigStore' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();
    
    // API routes
    if (pathname === '/health' && method === 'GET') {
      return handleHealth(env);
    }
    
    if (pathname === '/config' && method === 'GET') {
      return handleConfigList(env);
    }
    
    if (pathname === '/seed' && method === 'POST') {
      return handleSeed(env);
    }
    
    // CORS for API
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not implemented' }), {
        status: 501,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    // Serve UI from Workers Sites KV
    const path = url.pathname === '/' || !url.pathname.includes('.') 
      ? 'index.html' 
      : url.pathname.slice(1);
    
    try {
      const obj = await env.__STATIC_CONTENT.get(path);
      if (!obj) {
        // SPA fallback
        const index = await env.__STATIC_CONTENT.get('index.html');
        if (!index) return new Response('Not found', { status: 404 });
        return new Response(index as any, { 
          headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' } 
        });
      }
      
      const ct = path.endsWith('.js') ? 'application/javascript' :
                 path.endsWith('.css') ? 'text/css' :
                 path.endsWith('.html') ? 'text/html' :
                 path.endsWith('.svg') ? 'image/svg+xml' :
                 'application/octet-stream';
      
      const headers: Record<string, string> = { 'Content-Type': ct };
      if (path.endsWith('.html')) {
        headers['Cache-Control'] = 'no-cache';
      }
      
      return new Response(obj as any, { headers });
    } catch (e) {
      return new Response('Error: ' + String(e), { status: 500 });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Scheduled event triggered');
  }
};
