/**
 * Config Seed Script
 * Seeds the initial project config from examples/quickstart/config.json
 * Usage: wrangler dev -> POST /seed (or run locally with node)
 */

import { ConfigStore } from '@delta-curator/runtime';
import type { ProjectConfig } from '@delta-curator/protocol';

// Default seed config - loaded from examples/quickstart/config.json
const DEFAULT_SEED_CONFIG: ProjectConfig = {
  version: '1.0.0',
  project_id: 'quickstart-demo',
  project_name: 'Quickstart Demo Project',
  topic: {
    id: 'demo-topic-v0',
    label: 'Example topic for demonstration'
  },
  sources: [
    {
      id: 'demo-rss-source',
      plugin: 'rss_source',
      config: {
        feed_url: 'https://example.com/feed.xml',
        user_agent: 'delta-curator/0.1',
        max_items_per_batch: 50
      }
    }
  ],
  pipeline: {
    normalizer: {
      plugin: 'text_normalizer',
      config: {
        accept_mime_prefixes: ['text/', 'application/xhtml+xml', 'application/xml'],
        max_bytes_inline: 1048576
      }
    },
    extractor: {
      plugin: 'regex_facet_extractor',
      config: {
        facets: [
          {
            name: 'keyword_match',
            kind: 'boolean',
            pattern: '(?i)example'
          }
        ],
        facet_postprocess: {}
      }
    },
    resolver: {
      plugin: 'dictionary_resolver',
      config: {
        entities: {},
        mapping: []
      }
    },
    comparator: {
      plugin: 'fingerprint_comparator',
      config: {
        deltas: {
          new_doc: true
        },
        neighbors: { by_fingerprint_k: 5 }
      }
    },
    ranking: {
      ingest: {
        enabled: false,
        backend: 'none',
        max_passage_chars: 4000
      },
      search: {
        enabled: false,
        backend: 'none',
        rerank: true
      }
    },
    decider: {
      plugin: 'rules_decider',
      config: {
        rules: [
          {
            when: { has_delta: 'new_doc' },
            action: 'append',
            score: 0.7,
            reasons: ['new_doc']
          }
        ],
        default_action: 'reject',
        default_score: 0.1,
        default_reasons: ['no_novelty']
      }
    },
    merger: {
      plugin: 'patch_to_mutations',
      config: {
        append_only_on_accept: true,
        curated_doc_schema: 'v0',
        write_indexes: {
          facet_index: true,
          fingerprint_index: true,
          hold_index: true
        }
      }
    }
  },
  storage: {
    committer: {
      plugin: 'd1_committer',
      config: {
        database: 'DB'
      }
    },
    artifacts: {
      kind: 'r2',
      bucket: 'ARTIFACTS',
      prefix: 'delta-curator/'
    }
  },
  runtime: {
    max_items_per_batch: 50,
    clock: { mode: 'system' }
  },
  schedules: {
    enabled: false,
    sources: []
  }
};

/**
 * Seed configuration interface
 */
export interface SeedOptions {
  db: D1Database;
  bucket: R2Bucket;
  config?: ProjectConfig;
  activate?: boolean;
}

/**
 * Seed result
 */
export interface SeedResult {
  success: boolean;
  projectId?: string;
  version?: string;
  r2Key?: string;
  hash?: string;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * Seed the initial project config
 * Idempotent: if config already exists with same hash, returns alreadyExists=true
 */
export async function seedConfig(options: SeedOptions): Promise<SeedResult> {
  const { db, bucket, config = DEFAULT_SEED_CONFIG, activate = true } = options;

  const store = new ConfigStore({ db, bucket });

  try {
    // Check if config already exists
    const existing = await store.read(config.project_id);

    if (existing.success && existing.config) {
      // Config exists, check if it's the same
      const existingConfig = existing.config;
      if (JSON.stringify(existingConfig) === JSON.stringify(config)) {
        return {
          success: true,
          alreadyExists: true,
          projectId: config.project_id,
          version: config.version
        };
      }

      // Config exists but different - create new version
      const result = await store.write(config, activate);

      if (!result.success) {
        return {
          success: false,
          error: result.error
        };
      }

      return {
        success: true,
        projectId: result.projectId,
        version: result.version,
        r2Key: result.r2Key,
        hash: result.hash,
        alreadyExists: false
      };
    }

    // Config doesn't exist - write it
    const result = await store.write(config, activate);

    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }

    return {
      success: true,
      projectId: result.projectId,
      version: result.version,
      r2Key: result.r2Key,
      hash: result.hash,
      alreadyExists: false
    };
  } catch (err) {
    return {
      success: false,
      error: `Seed failed: ${err}`
    };
  }
}

/**
 * HTTP handler for seed endpoint
 * POST /seed
 */
export async function handleSeed(request: Request, db: D1Database, bucket: R2Bucket): Promise<Response> {
  try {
    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(request.url);
    const activate = url.searchParams.get('activate') !== 'false'; // default true

    // Check if custom config provided in body
    let customConfig: ProjectConfig | undefined;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        const body = await request.json() as ProjectConfig;
        customConfig = body;
      } catch {
        // Use default config
      }
    }

    const result = await seedConfig({
      db,
      bucket,
      config: customConfig,
      activate
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const status = result.alreadyExists ? 200 : 201;

    return new Response(
      JSON.stringify({
        success: true,
        project_id: result.projectId,
        version: result.version,
        r2_key: result.r2Key,
        hash: result.hash,
        already_exists: result.alreadyExists,
        active: activate
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
