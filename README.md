# Delta-Curator

**Event-sourced novelty accumulation system for continuous intelligence monitoring**

Delta-Curator is an intelligent document ingestion and curation platform that automatically monitors external sources, detects novel information, and builds curated collections. Built with event sourcing principles and designed for both local and cloud deployment.

## Features

✨ **Core Capabilities**
- **Continuous Monitoring**: Watch RSS feeds, file drops, and custom sources
- **Novelty Detection**: Intelligent comparison using semantic fingerprinting and ML models
- **Event-Sourced**: Complete audit trail of every decision with deterministic replay
- **Flexible Ranking**: Ingest-time and query-time reranking via AI models
- **Multi-Backend Support**: Local SQLite or cloud-native Cloudflare D1
- **Plugin Architecture**: Extensible comparators, deciders, rankers, and sources

⚡ **Technical Highlights**
- **Deterministic Pipeline**: Frozen clock ensures identical results for same inputs (I3)
- **Atomic Transactions**: Guaranteed consistency with atomic batch commits (I1)
- **Semantic Identity**: Dual-hash system prevents duplicates across format changes (I2)
- **Referential Transparency**: Pure functions with no global state (I4)

🚀 **Deployment Options**
- **Local**: Node.js + SQLite for development and small-scale operations
- **Cloud**: Cloudflare Workers + D1 + R2 for serverless global scale
- **Hybrid**: CLI with `--worker-url` flag for local control, cloud execution

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm (or npm)
- For cloud deployment: Cloudflare account

### Local Development

```bash
# Install dependencies
pnpm install

# Initialize workspace
delta-curator init

# Drop documents in .delta/inbox/ directory

# Run one batch
delta-curator run-batch

# Watch for changes on interval
delta-curator watch --interval 5000

# Rebuild read models from events
delta-curator rebuild
```

### Cloud Deployment (Cloudflare Workers)

```bash
# 1. Create D1 database
wrangler d1 create delta-curator

# 2. Update wrangler.toml with database ID
# Edit apps/worker/wrangler.toml and replace REPLACE_WITH_REAL_ID

# 3. Deploy
pnpm deploy

# 4. Test deployed Worker
curl https://your-worker.workers.dev/health
# → {"ok":true,"version":"0.1.0"}

# 5. Or use CLI thin wrapper
delta-curator run-batch --worker-url https://your-worker.workers.dev
```

## Architecture

### Pipeline Stages

Delta-Curator processes documents through a deterministic pipeline:

```
1. FETCH    → Read batch from source (RSS feed, file drop, etc.)
            ↓
2. OBSERVE  → Emit item_observed events for each document
            ↓
3. ASSESS   → Compare against existing corpus via Comparator plugin
            ↓
4. RANK     → Optional: score via Workers AI or other models
            ↓
5. DECIDE   → Apply Decider rules (append, hold, reject)
            ↓
6. MERGE    → Convert decisions to mutations for read models
            ↓
7. COMMIT   → Atomically persist events and mutations
            ↓
OUTCOME     → Updated curated_docs, hold_index, fingerprint_index
```

### Event-Sourced Design

Every decision is persisted as an immutable event:
- `item_observed` - Document ingested
- `item_assessed` - Comparison result with novelty score
- `item_decided` - Accept/reject/hold decision with reason
- `item_merged` - Read model mutations applied

Replay events in order to rebuild state deterministically.

### Read Models

Three queryable views are maintained:

| View | Purpose | Use Case |
|------|---------|----------|
| `curated_docs` | Accepted documents | Search & browse approved content |
| `fingerprint_index` | Semantic deduplication | Prevent similar duplicates |
| `hold_index` | Pending review queue | Manual moderation workflow |

## Configuration

Configure sources, plugins, and rules in `config.json`:

```json
{
  "topic": {
    "id": "my-topic",
    "label": "Human-readable topic name"
  },

  "sources": [
    {
      "id": "news-feed",
      "plugin": "rss_source",
      "config": {
        "feed_url": "https://example.com/feed.xml",
        "max_items_per_batch": 50
      }
    }
  ],

  "pipeline": {
    "comparator": {
      "plugin": "fingerprint_comparator",
      "config": { "deltas": { "new_doc": true } }
    },

    "ranking": {
      "ingest": {
        "enabled": true,
        "backend": "workers_ai_rerank",
        "model": "@cf/baai/bge-reranker-base",
        "query": "Your search query for reranking"
      }
    },

    "decider": {
      "plugin": "rules_decider",
      "config": {
        "rules": [
          { "when": { "has_delta": "new_doc" }, "action": "append" }
        ]
      }
    }
  },

  "storage": {
    "committer": {
      "plugin": "sqlite_committer",
      "config": { "sqlite_path": "./kb/db.sqlite" }
    }
  }
}
```

## Usage Examples

### Example 1: FDA Communications Monitor

Monitor FDA regulatory communications relevant to a specific company:

```bash
# Set up
delta-curator init -d ./regeneron-monitor
cd regeneron-monitor

# Configure sources in config.json with FDA RSS feeds
# Configure comparator to detect novelty (new documents, new CFR citations)
# Configure decider to accept if mentions Regeneron AND new document

# Run continuously
delta-curator watch --interval 300000  # Check every 5 minutes

# Or via Cloudflare Worker
delta-curator run-batch --worker-url https://my-worker.workers.dev
```

### Example 2: Content Curation with Reranking

Ingest documents and rank by relevance:

```json
"ranking": {
  "ingest": {
    "enabled": true,
    "backend": "workers_ai_rerank",
    "model": "@cf/baai/bge-reranker-base",
    "query": "machine learning research papers on transformers"
  }
}
```

Pipeline automatically scores documents during ingest. Query-time search can optionally rerank results.

### Example 3: Hold Queue for Manual Review

Capture uncertain items for manual decision:

```json
"decider": {
  "rules": [
    {
      "when": { "confidence_below": 0.6 },
      "action": "hold",
      "queue": "manual-review"
    }
  ]
}
```

Query `hold_index` table to see pending items. Run `delta-curator inspect` for digest.

## API Endpoints (Worker)

When deployed to Cloudflare Workers:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/run` | Execute one batch cycle |
| `GET` | `/health` | Health check with last commit ID |
| `GET` | `/inspect?since=PT24H&format=markdown` | Event digest |
| `GET` | `/search?q=query&k=20&rerank=true` | Query curated docs |

**Example:**
```bash
# Run batch via Worker
curl -X POST https://worker.dev/run

# Check health
curl https://worker.dev/health
# → {"ok":true,"version":"0.1.0","last_commit_id":"abc123..."}

# Get digest of last 24 hours
curl "https://worker.dev/inspect?since=PT24H&format=markdown"

# Search documents
curl "https://worker.dev/search?q=regeneron&k=10"
```

## CLI Commands

```bash
delta-curator init [OPTIONS]
  Initialize workspace with directories and database
  Options: -d, --dir <dir>  (default: .delta)

delta-curator run-batch [OPTIONS]
  Execute one fetch-stage-commit cycle
  Options: --worker-url <url>  (proxy to Cloudflare Worker)

delta-curator watch [OPTIONS]
  Watch for changes and run batches on interval
  Options: --interval <ms>  (default: 5000)

delta-curator rebuild
  Rebuild all read models from event log

delta-curator version
  Show version

delta-curator --help
  Show help message
```

## Development

### Project Structure

```
delta-curator/
├── packages/
│   ├── protocol/        # Type definitions and schemas
│   ├── runtime/         # Core Runner, Committer, plugins
│   └── sdk/             # High-level API
├── apps/
│   ├── cli/             # Command-line interface
│   └── worker/          # Cloudflare Worker app
├── plugins/
│   ├── sources/         # Data source plugins
│   ├── comparators/     # Novelty detection plugins
│   ├── deciders/        # Decision logic plugins
│   ├── rankers/         # Ranking/scoring plugins
│   └── mergers/         # Read model mutation plugins
├── examples/
│   └── quickstart/      # Example configuration
└── __tests__/           # Integration tests
```

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Type check
pnpm lint

# Build all packages
pnpm build
```

### Creating Custom Plugins

Implement the plugin interface:

```typescript
import type { Comparator } from '@delta-curator/runtime';

export class MyComparator implements Comparator {
  id = 'my-comparator';
  version = '0.1.0';
  description = 'Custom comparison logic';

  async compare(candidate, baseViews) {
    return {
      source_item_id: candidate.source_item_id,
      novelty: 'novel' | 'duplicate' | 'similar',
      confidence: 0.8,
      rationale: 'Explanation of result'
    };
  }
}
```

## Deployment Checklist

### Local (SQLite)
- [ ] `pnpm install` - Install dependencies
- [ ] `delta-curator init` - Create workspace
- [ ] Update `config.json` with your sources and rules
- [ ] `delta-curator watch` - Start monitoring

### Cloud (Cloudflare Workers)
- [ ] `pnpm install` - Install dependencies
- [ ] `wrangler login` - Authenticate with Cloudflare
- [ ] `wrangler d1 create delta-curator` - Create D1 database
- [ ] Update `apps/worker/wrangler.toml` with database ID
- [ ] `pnpm deploy` - Deploy to Cloudflare
- [ ] Verify: `curl https://your-worker.workers.dev/health`

### Hybrid (Local CLI + Cloud Worker)
- [ ] Complete local and cloud setup above
- [ ] Use: `delta-curator run-batch --worker-url https://your-worker.workers.dev`
- [ ] CLI controls flow, Worker executes processing

## Invariants & Guarantees

Delta-Curator maintains five key invariants:

| Invariant | Guarantee | Mechanism |
|-----------|-----------|-----------|
| **I0** | Append-only event log | Events never deleted, only inserted |
| **I1** | Atomic progress | All-or-nothing batch commits via D1 batch API |
| **I2** | Semantic identity | Dual-hash (event_id + payload_hash) deduplication |
| **I3** | Determinism | Frozen clock ensures identical event_ids |
| **I4** | Transparency | Pure functions, no global state |

## Performance

### Throughput
- **Local (SQLite)**: ~100-500 items/batch depending on comparator complexity
- **Cloud (D1)**: Same logic, optimized for 10+ concurrent batches

### Latency
- **Batch processing**: 100ms-1s (mostly comparator plugin latency)
- **Ranking**: ~500ms for 50 items with Workers AI reranker
- **Query**: <100ms for curated_docs searches

### Scalability
- **Events**: D1 supports millions of events per database
- **Documents**: Fingerprint index optimizes duplicate detection
- **Concurrent runners**: Run multiple CLI instances or Worker triggers

## Troubleshooting

### Build Errors
```bash
# Clean and rebuild
pnpm -r run build

# Type check
pnpm lint
```

### Worker Deployment Fails
```bash
# Verify wrangler config
wrangler config list

# Check database binding
wrangler d1 list

# Dry run
wrangler deploy --dry-run
```

### No Items Processed
- Check source configuration (URLs, credentials)
- Verify `readBatch()` returns items
- Run with verbose logging (configure in source plugin)

### Duplicates Not Detected
- Verify fingerprint_index is populated
- Check comparator configuration for delta rules
- Inspect events in database: `SELECT * FROM events`

## Architecture Decisions

### Event Sourcing
Chose event sourcing for:
- Complete audit trail of all decisions
- Ability to replay history with different logic
- Idempotency: same inputs → same outputs always
- Distributed consensus: events are facts

### Plugin System
Extensible plugin architecture for:
- Custom comparison logic (semantic, statistical, ML)
- Custom decision rules (threshold, workflow, priority)
- Custom ranking models (in-house, third-party)
- Custom sources (proprietary feeds, APIs)

### Dual Deployment
Support both local and cloud for:
- Development: fast iteration with SQLite
- Production: serverless global scale with D1
- Hybrid: orchestrate locally, execute in cloud

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and write tests
4. Run test suite: `pnpm test`
5. Commit with descriptive message
6. Push and open pull request

## License

[Add your license here]

## Support

- **Issues**: Report bugs on GitHub
- **Discussions**: Ask questions in GitHub Discussions
- **Documentation**: See [docs/](./docs/) directory

---

**Built with ❤️ for intelligent information discovery**
