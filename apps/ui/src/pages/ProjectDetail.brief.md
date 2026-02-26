# UX/UI Brief — Project Home Redesign (Revised to Resolve Agent Ambiguities)

## Goal
Make `/projects/:id` a calm “Home” for a Project as a living topic that continuously accumulates novelty, while preserving full explainability via progressive disclosure. Home must emphasize identity, intent, recent narrative, and connected sources—not pipeline/debug internals.

## Non-goals
- Do not remove or weaken inspection capability (runs, processed_items, rank_score, reranker query, cursors).
- Do not add complex enterprise role systems.
- Do not attempt backend API refactors unless strictly necessary for performance.

## Default Implementation Choices (to avoid further assumptions)
- **Use modals/drawers, not new routes**, for this sprint.
- **No backend API changes** this sprint: keep per-source `listRuns` fanout and merge client-side.
- **Minimal new UI primitives**: reuse existing Tailwind + existing card/button styles in this filebase.

---

# Decisions Locked In

## 1) Architecture: Modals/Drawers vs Routes
### Preferred (for this sprint)
- Home stays at `/projects/:id`.
- Deep inspection uses **a right-side drawer on desktop** and **full-screen modal on mobile**.
- Use query params for deep links:
  - `?inspectRun=<commitId>` opens Run Detail.
  - `?settings=1` opens Project Settings.

### Why
- Avoids router expansion and new pages while still supporting shareable deep links.

### Implementation requirements
- If query param exists on mount, open appropriate drawer/modal.
- Closing drawer/modal removes query param (router replace).

---

# Data & API (No Backend Changes)

## Existing calls to use
- `apiStore.getConfig(projectId)` — required
- `apiStore.inspect('PT24H','json',projectId)` — cursors/inspect
- `apiStore.listRuns({ projectId, sourceId, limit: 5 })` — per source, merge client-side

## Client-side merge plan (Recent Activity)
- Fetch `listRuns` for each source (existing behavior).
- Build `recentRunsMerged`:
  - flatten all runs from all sources
  - annotate each run with `source_id`
  - sort by `run_at desc` (null/invalid last)
  - take top N (N=5 default)
- This is sufficient for Home.

## Performance constraints / fallback behavior
- If project has many sources (fanout heavy), still proceed, but:
  - render Home shell immediately after `getConfig` + `inspect`
  - lazy-load runs: show “Recent Activity: loading…” and populate when ready
- If `listRuns` fails for some sources:
  - keep Home functional
  - show partial activity
  - surface a small non-blocking warning in Recent Activity header: “Some runs unavailable”

---

# Heuristics (Explicit thresholds)

## Source “stale” threshold
- **Stale if cursor_published_at is older than 48 hours** relative to now.
- If cursor is missing/not set → status “Unknown” (neutral badge).

## Source “error” indicator
- If the most recent run in that source’s `listRuns(limit=1)` is known-failed (if such a field exists):
  - show Error badge.
- If no explicit failure field exists in RunSummary:
  - do not infer “Error”; only show OK/Stale/Unknown.

## Status strip tile values
- “Last Run”:
  - max `run_at` from `recentRunsMerged`
- “Processed (last 24h proxy)”:
  - sum of `item_count` across the merged top N runs **OR** across all runs fetched if cheap; prefer top N to avoid misleading totals
- “Events (last 24h proxy)”:
  - sum of `event_count` similarly
- “Sources”:
  - count of `project.config.sources`
- “Stale sources”:
  - count where stale heuristic holds (only if cursor available)

If “events accepted” is not available, **label tile as “Events”**, not “Accepted”.

---

# UI/UX Details (Explicit interaction rules)

## Editing Modes (Name + Criteria)
### Global rule
- No “always-editable” inputs on Home. Editing must be intentional.

### Project Name
- Default: H1 text + pencil icon button.
- Edit mode: input + Save/Cancel buttons.
- Key behaviors:
  - Enter = Save
  - Esc = Cancel
  - Blur does **not** save (prevents accidental commits)

### Novelty Criteria
- Default: chips view + “Edit” button.
- Edit mode: textarea (comma-separated) + Save/Cancel.
- Key behaviors:
  - Enter does not auto-save (textarea supports multi-line paste)
  - Ctrl/Cmd+Enter = Save
  - Esc = Cancel
- Validation:
  - cannot be empty after trimming
  - saved canonical form is `rules: string[]` split on commas, trimmed, filter(Boolean)
- Error + saving feedback:
  - inline, directly under controls (existing inlineSaving/inlineSaveError ok)

### Chip rendering
- Chips are display-only on Home (no drag/drop or inline chip editing needed this sprint).
- In edit mode, a preview row of chips is optional; not required.

---

# Home Page Layout (Revised Zones)

## Zone 0 — Loading / Not Found
Keep existing logic. Optional: skeletons, not required.

## Zone 1 — Header: Identity + Overflow
Left:
- H1 Project Name (static)
- muted Project ID
Right:
- Overflow menu button (kebab)
  - Manage Sources → `/projects/:id/sources`
  - Project Settings → open `?settings=1`
  - View Runs → scroll to Recent Activity card (no new route this sprint)
  - Delete Project… → only inside settings “Danger Zone” (not in overflow if you want extra safety)

## Zone 2 — Status Strip Tiles (3–5 tiles)
Locked tile set (avoid debates):
1. Last Run
2. Events (proxy)
3. Items (proxy)
4. Sources (count)
5. Stale (count, if any cursor data exists; else omit tile)

Responsive behavior:
- Mobile: 2-column grid wrapping
- Desktop: single row, wrap allowed

## Zone 3 — Novelty Criteria Card
As specified above.

## Zone 4 — Recent Activity Card (Narrative)
- Show top 5 merged runs.
- Each row shows:
  - Relative time + absolute UTC minute
  - Source ID
  - items: item_count
  - events: event_count
- Status:
  - If run has a `status`/`ok` field, map:
    - ok → “OK”
    - failed → “Fail”
    - else → “Unknown”
  - If no status field exists, omit status badge.
- Row click opens Run Detail drawer/modal:
  - set query param `inspectRun=<commitId>`

“Load more”:
- Not required this sprint.
- Provide “View more” link that navigates to Sources page for deeper exploration.

## Zone 5 — Sources Summary Card (Configuration-first)
Row behavior (locked choice):
- Clicking a source row **navigates to** `/projects/:id/sources` (no expand-on-home).
- Each row shows:
  - Source ID
  - Plugin
  - Cursor time (“Next run rule: RSS pubDate after …”)
  - Health badge (OK/Stale/Unknown/Error per heuristics)
- Provide a small “Inspect last run” button on the row’s right if last run exists:
  - opens `inspectRun=<commitId>`
- Do **not** show nested run lists or processed items on Home.

## Zone 6 — Footer Links
- “Open Project Settings”
- “Manage Sources”

Storage configuration is removed from Home.

---

# Deep Inspection Surface (Run Detail Drawer/Modal)

## Trigger
- From Recent Activity or “Inspect last run” in Sources summary.
- Also via URL query `?inspectRun=<commitId>`.

## Contents (dense allowed)
1. Run summary
   - run_at (relative + absolute UTC)
   - source_id
   - item_count, event_count
2. Advanced (collapsed by default)
   - reranker_query (if present)
3. Processed items (scrollable list)
   - title/id
   - url/id
   - outcome
   - rank_score displayed by default ONLY when:
     - `outcome === 'skipped_low_rank' && rank_score != null`
   - Optional toggle “Show all scores”:
     - default OFF
     - when ON, show rank_score for any item with rank_score
4. Raw JSON (collapsed by default)
   - “Show raw JSON” only if a raw object is available in the run result
   - If not available, omit the section entirely

Data sourcing for run detail:
- Prefer reusing already-fetched run objects from `sourceRuns`.
- If detail requires fields absent from summary list:
  - call `apiStore.getRun(commitId)` if exists
  - if no such API exists, show what we have; do not block ship.

---

# Project Settings Drawer/Modal

## Trigger
- From overflow → Settings, or URL `?settings=1`

## Sections
1. Storage Configuration (moved here)
   - committer plugin + database
   - artifacts kind + bucket
2. Danger Zone
   - Delete Project button
   - Confirm dialog text unchanged, but now contextual:
     - includes project_name and project_id
   - Deleting state disables button and closes modal on success (then router push `/projects`)

---

# Components & Styling

## Reuse existing styling conventions
- Use existing `rounded-lg border bg-card` patterns.
- Buttons:
  - Primary: `bg-primary text-primary-foreground` if present in project
  - Secondary: border + muted
  - Danger: destructive style only inside Settings

## New components (optional; not mandatory)
If time-constrained, keep everything in ProjectDetail.vue with clear sub-block comments.
If modularizing:
- `ProjectHomeHeader.vue`
- `ProjectStatusTiles.vue`
- `NoveltyCriteriaCard.vue`
- `RecentActivityCard.vue`
- `SourcesSummaryCard.vue`
- `RunDetailDrawer.vue`
- `ProjectSettingsDrawer.vue`

No dependency on Vuetify or new UI libraries.

---

# Accessibility Requirements (Minimal, explicit)
- Overflow menu button: `aria-label="Project actions"`
- Drawer/modal:
  - focus trap if existing component supports it; otherwise:
    - focus first interactive element on open
    - Esc closes
- All toggles are `<button>` not clickable divs.

---

# Error Handling Rules
- If `getConfig` fails:
  - show “Project not found” only if 404 is confirmed; otherwise show “Failed to load project.”
- If `inspect` fails:
  - still render Home; source health badges become “Unknown”
- If inline save fails:
  - revert UI state, show inlineSaveError (existing behavior)

---

# Testing (Minimal must-have)
1. Home renders with:
   - config loaded
   - inspect fails
   - listRuns partially fails
2. Edit flows:
   - Name: enter save, esc cancel, validation
   - Criteria: save/cancel, empty validation
3. Deep link:
   - opening `/projects/:id?inspectRun=...` opens run detail
   - closing removes query param
4. Delete exists only in Settings, not on Home

---

# Migration Mapping (Old → New, precise)
- Remove from Home:
  - `expandedSources`, `expandedRuns` UI and nested lists
  - JSON config preview pill
  - “Storage Configuration” card
  - top-level Delete button
- Preserve logic by relocating:
  - Run/item detail rendering → Run Detail drawer
  - Storage config → Settings drawer

---

# Deliverable Checklist
- Project Home is calm and readable.
- Recent Activity provides narrative + one-click Inspect.
- Sources is configuration-first with health badges.
- Full trace exists behind Inspect.
- Delete moved behind Settings.
- URL query deep links work for Inspect and Settings.