# Delta-Curator Agent Brief Addendum — Cloudflare-Native Ranking (Workers AI + AI Search)

This addendum modifies the previously agreed “Final, Agent-Proof” brief. The repo MUST be Cloudflare-native from day 1. Wrangler is required. The system MUST support two Cloudflare ranking paths:
1) Workers AI reranker for per-item scoring.
2) AI Search reranking for query-time retrieval.

No Railway dependency in v0/v1.

---

## 0) Non-Negotiables (New)

- The primary runtime is **Cloudflare Workers**.
- Local development uses **wrangler dev** (no separate Node-only execution path).
- Ranking is implemented using **Cloudflare Workers AI** (reranker model) and **Cloudflare AI Search** (rerank during retrieval).
- The CLI may exist, but it must act as a thin wrapper over the Worker (HTTP calls), not a separate execution engine.

---

## 1) Repo Layout Changes (Exact)

Replace `apps/cli` with `apps/worker` and keep an optional thin CLI wrapper (calls Worker).

```

delta-curator/
├── packages/
│   ├── protocol/
│   ├── runtime/
│   └── sdk/
├── plugins/
├── apps/
│   ├── worker/                 # REQUIRED (Cloudflare Worker entrypoint)
│   │   ├── wrangler.toml
│   │   ├── src/
│   │   │   ├── index.ts        # fetch() + scheduled() handlers
│   │   │   ├── routes.ts       # /run, /inspect, /search, /health
│   │   │   └── env.ts          # typed bindings (D1/R2/AI/AI Search)
│   │   └── test/
│   │       └── worker.e2e.test.ts
│   └── cli/                    # OPTIONAL thin client (HTTP calls to worker)
│       ├── src/main.ts
│       └── test/cli.test.ts
├── examples/quickstart/
└── docs/

````

---

## 2) Storage Backend (Cloudflare-Native)

SQLite committer remains as a reference implementation, but v1 MUST ship with:

- **D1Committer**: commit log + event index + read models in D1
- **R2Artifacts**: raw doc artifacts + comparator snapshots + optional event batch blobs

### 2.1 D1 Schema (minimum)
Port the SQLite schema to D1 (SQLite-compatible). Required tables:
- commits, events, artifacts, source_state
- facet_index, fingerprint_index, hold_index, curated_docs
Indexes: hold `(queue, until)`.

### 2.2 Commit Protocol
Same invariants:
- idempotent `commitKey` unique
- global dedup by `event_id`
- cursor state updated only in commit transaction
- artifacts stored in R2 first (idempotent key = commitKey+name), then committed in D1

---

## 3) Cloudflare Ranking Requirements (Core Change)

### 3.1 Ranking signal contract
`CandidateCompared.signals` MUST include:
- `rank_score` (float)
- `rank_backend` (string enum: `"workers_ai_rerank"` | `"ai_search_rerank"` | `"none"`)
- optionally `rank_model` (string)

Ranking NEVER affects novelty deltas in v0. It is advisory for inspection ordering and optional hold thresholds.

### 3.2 Workers AI reranker (per-item scoring)
Implement a Ranker plugin:
- `id(): "workers_ai_rerank"`
- `score(query: string, passages: {id, text}[]) -> {id, score}[]`

Worker binding:
- Use Cloudflare Workers AI `AI` binding.
- Model: `@cf/baai/bge-reranker-base` (configurable).
- Passage construction (deterministic):
  - `title` + first N chars of normalized text (N configurable, default 4000)
  - appended summary of facets: product_family list + CFR citations

Store result in `CandidateCompared.signals.rank_score`.

### 3.3 AI Search reranking (query-time)
Implement search endpoint and backend:
- `/search?q=...&k=20`
- Uses **Cloudflare AI Search** index.
- Must support reranking enabled/disabled (config).
- Output: list of curated docs (source_item_id) in reranked order + scores if available.

AI Search is used for retrieval, not ingestion.

---

## 4) Worker API (Required)

Implement routes:

- `POST /run`  
  Body: `{ source_id, max_items, once }`  
  Runs one batch loop. Returns `{ commit_id?, items_processed, events_written }`.

- `GET /inspect?since=PT24H&format=markdown`  
  Returns markdown digest of deltas/decisions/holds, sorted by rank_score when present.

- `GET /search?q=...&k=20&rerank=true`  
  Query-time retrieval using AI Search (+ rerank if enabled).

- `GET /health`  
  Returns `{ ok: true, version, last_commit_id? }`.

Also implement Worker `scheduled()` handler:
- Runs `/run` for configured sources daily (America/Chicago scheduling preference; implement UTC cron in wrangler).

---

## 5) Config Changes

Config file remains at:
`examples/quickstart/config.json` (or repo root for real deployment)

Add:
```json
{
  "ranking": {
    "ingest": {
      "enabled": true,
      "backend": "workers_ai_rerank",
      "model": "@cf/baai/bge-reranker-base",
      "query": "FDA communications relevant to Regeneron regulatory risk",
      "max_passage_chars": 4000
    },
    "search": {
      "enabled": true,
      "backend": "ai_search_rerank",
      "index": "delta-curator-regeneron",
      "rerank": true
    }
  }
}
````

---

## 6) Implementation Order (Updated)

1. protocol hashing + schemas (unchanged)
2. runtime interfaces + runner (unchanged)
3. D1Committer + schema migration
4. R2Artifacts store
5. Worker app: routes + scheduled handler
6. Workers AI reranker plugin (ingest ranking)
7. AI Search integration + `/search`
8. Inspect digest sorts by rank_score
9. Tests: idempotency, determinism with injected Clock, crash recovery (artifact write then failed commit), worker e2e

---

## 7) Testing Requirements (Updated)

* All tests run under wrangler/miniflare environment.
* E2E:

  * Seed a few docs via a file-drop source (local dev)
  * Run `/run` twice (idempotent)
  * Verify rank_score is present when enabled (mock AI binding if needed)
  * Verify `/search` returns reranked results when enabled (mock AI Search API or use a stub adapter)

---

## 8) Definition of Done (Updated)

* `wrangler dev` runs the worker locally.
* `POST /run` ingests deterministically and commits to D1.
* R2 artifacts written before commit; retry is idempotent.
* Workers AI rerank populates `rank_score`.
* `/inspect` returns markdown digest, sorted by rank_score.
* `/search` returns reranked results from AI Search when enabled.

End.
