# AGENTS.md — Delta-Curator (Current State)

This document describes the **current implemented state** of the repository so contributors and coding agents can align changes with what is actually running today.

---

## 1) Product Scope

Delta-Curator is an event-oriented ingestion and curation system running on Cloudflare Workers.

- Runtime: Cloudflare Worker (`apps/worker`)
- Storage: D1 (state/read models) + R2 (config/artifacts)
- Ranking: Workers AI ingest-time reranker; search endpoint supports scoped retrieval
- UI: Vue app (`apps/ui`) is present and actively used for project/source operations

---

## 2) Current Architecture

Monorepo (pnpm workspaces) with these active parts:

- `apps/worker`: primary HTTP API and persistence logic
- `apps/ui`: operator UI (projects, sources, run, inspect, content, search)
- `apps/cli`: thin client package
- `packages/protocol`: shared schemas/types/canonicalization/hashing
- `packages/runtime`: runtime abstractions and commit/artifact helpers
- `plugins/*`: plugin packages (sources/comparator/decider/merger/ranker)

The repository is not worker-only; UI and project-scoped UX are part of the current product.

---

## 3) API Surface (Implemented)

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
- Microsoft OAuth routes are present.

### Operations (strict project-scoped)

The following now require explicit `project_id`:

- `POST /run` body requires `project_id`
- `GET /inspect` query requires `project_id`
- `GET /search` query requires `project_id`
- `POST /sources/cursor` body requires `project_id` and admin auth

Project-scoped operation endpoints intentionally no longer rely on implicit active-project fallback.

---

## 4) Source Controls

### Pause / resume

Per-source pause is implemented via:

- `sources[].enabled` (default `true`) in protocol schema
- Worker run path skips disabled sources and returns clear errors for paused requested sources
- UI Sources page exposes Enabled/Paused toggle

### Cursor management

- Cursor updates are supported via `POST /sources/cursor`
- Inspect route returns per-source cursor metadata
- Inspect UI supports set/clear cursor controls

---

## 5) RSS Source Behavior (Current)

Implemented in `apps/worker/src/sources/rss.ts`:

- Single-feed snapshot fetch (no true pagination loop)
- Watermark cursor using `cursorPublishedAt`
- GUID/link/title fallback identity
- Dedupe state with bounded `recentGuids`
- Per-run item cap from run request (`max_items`, clamped in worker)

Limits currently include:

- `max_items` run clamp in worker
- bounded recent GUID memory (500)

---

## 6) Scheduler Status

`scheduled()` exists in worker entrypoint but is currently a stub (logs trigger only). Automatic per-project/per-source orchestration via schedules is not yet fully wired in current code.

---

## 7) Data and Compatibility Notes

- Worker includes schema-adaptive write paths for legacy/new D1 shapes in key tables.
- Active-project normalization enforces single-active consistency for config listing/get-active behavior.
- Project-scoped routes and APIs are the preferred context model.

---

## 8) Contributor Expectations

When changing behavior, keep these aligned:

- `apps/worker/src/index.ts` route contracts
- `packages/protocol/src/config.ts` schema defaults
- `apps/ui/src/stores/api.ts` request payloads/query params
- UI pages under `apps/ui/src/pages` that call run/inspect/search/cursor APIs

Update this file and `README.md` whenever route contracts, required parameters, or source state semantics change.
