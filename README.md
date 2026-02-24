# Delta-Curator

Event-oriented ingestion and curation for continuous intelligence monitoring.

Delta-Curator runs primarily on Cloudflare Workers, persists state/read models in D1, and stores config/artifacts in R2. It includes an operator UI for project-scoped operations (projects, sources, run, inspect, search, content).

---

## What’s in this repo

- `apps/worker`: Cloudflare Worker API
- `apps/ui`: Vue operator interface
- `apps/cli`: thin client package
- `packages/protocol`: shared schemas/types/canonicalization/hashing
- `packages/runtime`: runtime abstractions and commit helpers
- `plugins/*`: source/comparator/decider/merger/ranker plugins

---

## Runtime model

Primary runtime: **Cloudflare Workers**

- Storage:
  - **D1**: commits, events, source state, read models
  - **R2**: project config blobs + artifacts
- AI:
  - **Workers AI reranker** for ingest-time scoring (when enabled)
- Scheduling:
  - `scheduled()` entrypoint exists but is currently a **stub** (logs only)

---

## API (current)

### Config and auth

- `GET /config`
- `POST /config`
- `GET /config/:projectId`
- `POST /config/:projectId/activate`
- `DELETE /config/:projectId/:version`
- `GET /config/active`
- `POST /seed`
- `POST /api/auth/admin`
- `POST /api/auth/admin/token`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- Microsoft OAuth routes

### Operations (strict project-scoped)

The endpoints below require explicit project context:

- `POST /run` with JSON body containing `project_id`
- `GET /inspect` with query param `project_id`
- `GET /search` with query param `project_id`
- `POST /sources/cursor` with JSON body containing `project_id` (admin auth required)

Examples:

```bash
curl -X POST http://localhost:8787/run \
  -H "Content-Type: application/json" \
  -d '{"project_id":"quickstart-demo","source_id":"demo-rss-source","max_items":50,"once":true}'

curl "http://localhost:8787/inspect?since=PT24H&format=json&project_id=quickstart-demo"

curl "http://localhost:8787/search?q=example&k=20&rerank=false&project_id=quickstart-demo"
```

---

## Source controls

Per-source pause/resume is supported:

- `sources[].enabled` in project config (`true` by default)
- Worker `/run` skips paused sources
- Worker returns clear errors when a paused source is requested
- UI Sources page includes Enabled/Paused toggle

Cursor management is supported via:

- `POST /sources/cursor` (set/clear cursor)
- Inspect response includes source cursor details
- Inspect UI includes per-source set/clear controls

---

## RSS source behavior (current)

`apps/worker/src/sources/rss.ts` currently implements:

- Single feed snapshot fetch per run (no multi-page traversal)
- Watermark cursor (`cursorPublishedAt`) filtering by item `pubDate`
- GUID/link/title fallback ID
- Dedupe via bounded recent GUID memory (`recentGuids`)
- Per-run output cap via `max_items` from `/run` (worker clamps values)

---

## Development

Install:

```bash
pnpm install
```

Run worker locally:

```bash
pnpm run dev:worker
```

Run UI locally:

```bash
pnpm --filter @delta-curator/ui dev
```

Build worker:

```bash
pnpm --filter @delta-curator/worker build
```

---

## Notes

- Active project still exists as a config convenience (`/config/active`), but operation endpoints are explicitly project-scoped.
- Worker includes schema-adaptive persistence paths for compatibility with legacy/new D1 table shapes.
- If route contracts or source state semantics change, update both `README.md` and `AGENTS.md`.
