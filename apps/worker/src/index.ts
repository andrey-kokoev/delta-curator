/**
 * Delta-Curator Worker
 * Cloudflare Workers entrypoint with fetch() and scheduled() handlers
 * Per AGENT_BRIEF2.md
 */

async function handleRequest(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  try {
    // GET /health
    if (pathname === '/health' && method === 'GET') {
      return new Response(
        JSON.stringify({
          ok: true,
          version: '0.1.0',
          last_commit_id: null
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // POST /run
    if (pathname === '/run' && method === 'POST') {
      return new Response(
        JSON.stringify({
          commit_id: null,
          items_processed: 0,
          events_written: 0
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // GET /inspect
    if (pathname === '/inspect' && method === 'GET') {
      const markdown = `# Delta-Curator Digest\n\n## Summary\n- No events\n\n---\nGenerated at ${new Date().toISOString()}`;
      return new Response(markdown, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown' }
      });
    }

    // GET /search
    if (pathname === '/search' && method === 'GET') {
      return new Response(
        JSON.stringify({
          query: url.searchParams.get('q') || '',
          k: parseInt(url.searchParams.get('k') || '20'),
          docs: [],
          total: 0
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(_event: any, env: any): Promise<void> {
    try {
      const url = new URL('https://worker/run');
      url.searchParams.set('once', 'true');
      await handleRequest(new Request(url, { method: 'POST' }), env);
    } catch (err) {
      console.error(`Scheduled batch failed: ${err}`);
    }
  }
};
