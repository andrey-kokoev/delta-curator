# Delta-Curator

Event-sourced novelty accumulation for continuous intelligence monitoring.

Delta-Curator ingests external documents in batches, evaluates each item for novelty relative to a curated base, applies explicit policy (append / hold / reject), and persists an append-only audit log as the sole source of truth. The primary runtime is Cloudflare Workers with D1 (state) and R2 (artifacts). Ranking is provided by Cloudflare Workers AI and AI Search.

This repo ships infrastructure, not a UI.

---

## Guarantees

- **Append-only log**: all facts are immutable; read models are derived and rebuildable.
- **Atomic progress**: source cursor advances only within a successful commit.
- **Semantic identity**: global dedup via `event_id` (semantic-core hash).
- **Deterministic replay**: given the same inputs and code, event sequences are identical.
- **Pure stages**: pipeline stages are referentially transparent.

---

## Runtime Model

Primary runtime: **Cloudflare Workers**

- Storage:
  - **D1**: commits, events, read models
  - **R2**: raw artifacts, comparator snapshots
- Scheduling:
  - Worker `scheduled()` trigger (cron)
- AI:
  - **Workers AI reranker** for ingest-time scoring
  - **AI Search reranking** for query-time retrieval

Local development runs via `wrangler dev`. The CLI (if present) is a thin HTTP client over the Worker.

---

## Worker API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/run` | Run one batch for a source |
| GET | `/inspect?since=PT24H&format=markdown` | On-demand digest |
| GET | `/search?q=...&k=20&rerank=true` | Query curated base |
| GET | `/health` | Health + last commit id |

Examples:

```bash
curl -X POST https://<worker>/run \
  -H "Content-Type: application/json" \
  -d '{"source_id":"fda-warning-letters","max_items":50,"once":true}'

curl "https://<worker>/inspect?since=PT24H&format=markdown"

curl "https://<worker>/search?q=regeneron%20CFR%20820&k=20&rerank=true"
````

---

## Event Model (Canonical)

Events are append-only and globally deduplicated by `event_id`:

* `RawDocObserved`
* `DocNormalized`
* `FacetsExtracted`
* `EntitiesResolved`
* `CandidateCompared`
* `DecisionMade`
* `PatchProposed`
* `MutationsPlanned`
* `CommitApplied`

Read models (rebuildable):

* `curated_docs`
* `facet_index`
* `fingerprint_index`
* `hold_index`

---

## Configuration

Config is JSON and passed to the Worker. Example (excerpt):

```json
{
  "sources": [
    {
      "id": "fda-warning-letters",
      "plugin": "rss_source",
      "config": {
        "feed_url": "https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program/medwatch-rss-feed",
        "max_items_per_batch": 50
      }
    }
  ],
  "ranking": {
    "ingest": {
      "enabled": true,
      "backend": "workers_ai_rerank",
      "model": "@cf/baai/bge-reranker-base",
      "query": "FDA communications relevant to Regeneron regulatory risk"
    },
    "search": {
      "enabled": true,
      "backend": "ai_search_rerank",
      "index": "delta-curator-regeneron",
      "rerank": true
    }
  }
}
```

Novelty detection is deterministic (explicit deltas). Ranking is advisory.

---

## Repo Layout

```
delta-curator/
├── packages/
│   ├── protocol/   # schemas, hashing, ids
│   ├── runtime/    # runner, interfaces, committer
│   └── sdk/        # plugin helpers
├── plugins/        # sources, extractors, comparators, deciders, mergers
├── apps/
│   └── worker/     # Cloudflare Worker (wrangler)
└── examples/quickstart/
```

---

## Deployment

```bash
pnpm install
wrangler login
wrangler d1 create delta-curator
pnpm deploy
```

Verify:

```bash
curl https://<worker>/health
```

---

## Non-Goals (v0/v1)

* No web UI
* No dashboards
* No topic orchestrator
* No claim-level knowledge graph
* No Railway dependency

This repo ships a working novelty accumulation substrate. Policy, scope, and ranking are configured, not hardcoded.
