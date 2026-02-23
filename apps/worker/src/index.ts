/**
 * Delta-Curator Worker
 * Cloudflare Workers entrypoint with fetch() and scheduled() handlers
 * Serves both API and UI (Vue.js SPA)
 */

import { handleFetch } from './routes.js';
import type { Env } from './env.js';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

/**
 * Serve UI static assets using Workers Sites
 */
async function serveUI(request: Request, env: Env): Promise<Response> {
  try {
    return await getAssetFromKV(
      {
        request,
        waitUntil: (promise: Promise<any>) => promise,
      },
      {
        ASSET_NAMESPACE: env.__STATIC_CONTENT,
        ASSET_MANIFEST: env.__STATIC_CONTENT_MANIFEST,
        mapRequestToAsset: (req: Request) => {
          const url = new URL(req.url);
          // Handle client-side routing - serve index.html for non-asset paths
          if (!url.pathname.includes('.') || url.pathname === '/') {
            url.pathname = '/index.html';
          }
          return new Request(url.toString(), req);
        },
      }
    );
  } catch (e) {
    // If asset not found, serve index.html for SPA routing
    try {
      return await getAssetFromKV(
        {
          request: new Request(new URL('/index.html', request.url)),
          waitUntil: (promise: Promise<any>) => promise,
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: env.__STATIC_CONTENT_MANIFEST,
        }
      );
    } catch {
      return new Response('Not found', { status: 404 });
    }
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
