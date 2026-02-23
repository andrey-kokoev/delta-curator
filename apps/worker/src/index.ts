/**
 * Delta-Curator Worker - API Only
 * Cloudflare Workers entrypoint with API handlers
 * UI is served separately via Cloudflare Pages
 */

import { handleFetch } from './routes.js';
import type { Env } from './env.js';

/**
 * Handle CORS preflight requests
 */
function handleCors(request: Request, env: Env): Response {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigins = env.UI_URL ? [env.UI_URL] : ['*'];
  
  // Check if origin is allowed
  const allowOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(origin) 
    ? origin 
    : allowedOrigins[0];
  
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

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigins = env.UI_URL ? [env.UI_URL] : ['*'];
  
  const allowOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(origin) 
    ? origin 
    : allowedOrigins[0];
  
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors(request, env);
    }
    
    // Handle all API requests
    const response = await handleFetch(request, env);
    
    // Add CORS headers to all responses
    return addCorsHeaders(response, request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
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
