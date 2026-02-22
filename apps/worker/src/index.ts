/**
 * Delta-Curator Worker
 * Cloudflare Workers entrypoint with fetch() and scheduled() handlers
 * Serves both API and UI (Vue.js SPA)
 */

import { handleFetch } from './routes.js';
import type { Env } from './env.js';

/**
 * Serve UI static assets from ASSETS binding
 */
async function serveUI(request: Request, env: Env): Promise<Response> {
  // Try to serve the requested asset
  const url = new URL(request.url);
  let path = url.pathname;
  
  // Handle client-side routing - serve index.html for non-asset paths
  if (!path.includes('.') || path === '/') {
    path = '/index.html';
  }
  
  try {
    // Clone request with modified URL for ASSETS
    const assetRequest = new Request(new URL(path, url.origin), request);
    const response = await env.ASSETS.fetch(assetRequest);
    
    if (response.status === 200) {
      // Add appropriate content type headers
      const headers = new Headers(response.headers);
      
      if (path.endsWith('.js')) {
        headers.set('Content-Type', 'application/javascript');
      } else if (path.endsWith('.css')) {
        headers.set('Content-Type', 'text/css');
      } else if (path.endsWith('.html')) {
        headers.set('Content-Type', 'text/html');
        // Add no-cache for HTML to ensure fresh app loads
        headers.set('Cache-Control', 'no-cache');
      }
      
      return new Response(response.body, {
        status: response.status,
        headers
      });
    }
    
    return response;
  } catch {
    // Fall back to index.html for SPA routing
    if (path !== '/index.html') {
      const indexRequest = new Request(new URL('/index.html', url.origin), request);
      return env.ASSETS.fetch(indexRequest);
    }
    return new Response('Not found', { status: 404 });
  }
}

/**
 * Check if request should be handled by API or UI
 */
function isApiRequest(url: URL): boolean {
  return url.pathname.startsWith('/api/') ||
         url.pathname.startsWith('/auth/') ||
         url.pathname.startsWith('/config') ||
         url.pathname.startsWith('/run') ||
         url.pathname.startsWith('/inspect') ||
         url.pathname.startsWith('/search') ||
         url.pathname.startsWith('/health') ||
         url.pathname.startsWith('/seed') ||
         url.pathname.startsWith('/test') ||
         url.pathname === '/login' ||
         url.pathname === '/logout';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Route API requests to API handler
    if (isApiRequest(url)) {
      return handleFetch(request, env);
    }
    
    // Serve UI for all other routes
    return serveUI(request, env);
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
