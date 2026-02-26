const fs = require('fs');
let code = fs.readFileSync('/home/andrey/src/delta-curator/apps/worker/src/index.ts', 'utf8');

code = code.replace(
  /async function ensureCommitsProjectScopeSchema\(env: Env\): Promise<void> \{([\s\S]*?)await env\.DB\.prepare\(\n\s*'CREATE INDEX/m,
  `async function ensureCommitsProjectScopeSchema(env: Env): Promise<void> {$1
  if (!commitColumns.has('processed_items')) {
    try {
      await env.DB.prepare('ALTER TABLE commits ADD COLUMN processed_items TEXT').run()
    } catch (err) {
      if (!String(err).includes('duplicate column name')) throw err
    }
  }

  if (!commitColumns.has('rerank_query')) {
    try {
      await env.DB.prepare('ALTER TABLE commits ADD COLUMN rerank_query TEXT').run()
    } catch (err) {
      if (!String(err).includes('duplicate column name')) throw err
    }
  }

  await env.DB.prepare(`
);

// We need to also inject processed_items and rerank_query into the queries.
// But using Regex for that is brittle. Let's do a simple string replace for the DDL.
fs.writeFileSync('/home/andrey/src/delta-curator/apps/worker/src/index.ts', code);
