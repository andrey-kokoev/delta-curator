# UX/UI Brief — Dashboard Redesign (Revised to Resolve Agent Ambiguities)

This revision makes hard choices so implementation can proceed without follow-up questions.

---

## 0) Locked Sprint Decisions

### Backend feasibility (answer)
- **YES**: implement backend support **now** for both:
  1) `last_reviewed_at` (UTC timestamp, nullable)
  2) `pinned` (boolean, default false)

No localStorage stopgaps this sprint.

### Recent Projects section
- Implement **both** Pinned and Recent.
- Recent signal is **server-provided**: `last_activity_at` (UTC timestamp, nullable) added to the project row payload.
  - If you already have a reliable activity timestamp, reuse it; otherwise add it.

### Window switcher scope
- Window switcher affects **project cards only** (Pinned + Recent).
- It does **not** affect the instance summary strip totals.
- It does **not** change which projects are “recent”; it only changes the “since …” counters shown on cards.

---

## 1) Goals

Dashboard becomes a calm workspace overview:
- “What changed since I last checked?”
- “Which topics should I open next?”
- Lightweight instance health, non-dominant.

---

## 2) Data Model + API (Required This Sprint)

### DB schema changes (projects table)
Add:
- `last_reviewed_at TIMESTAMP NULL`  (UTC)
- `pinned BOOLEAN NOT NULL DEFAULT false`
- `last_activity_at TIMESTAMP NULL` (UTC)  
  - semantics: last time the project produced any meaningful new processing signal (e.g., a run occurred, events written, docs curated). Pick the most available consistent signal.

Optional but recommended for correct counters without fanout:
- `activity_24h_events INT NOT NULL DEFAULT 0`
- `activity_7d_events INT NOT NULL DEFAULT 0`
- `activity_since_review_events INT NOT NULL DEFAULT 0`  
If you can’t maintain these server-side reliably this sprint, omit and compute on demand via a query endpoint below.

### API endpoints
1) `GET /projects`
Return list entries including:
- `project_id`, `project_name`
- `topic.label`
- `sources_count`
- `pinned`
- `last_reviewed_at`
- `last_activity_at`

2) `POST /projects/:id/review`
- sets `last_reviewed_at = now_utc`
- returns updated project row (or at least `last_reviewed_at`)

3) `PATCH /projects/:id`
Support updating:
- `{ pinned: boolean }`
Return updated project row (or at least `pinned`).

4) **Activity counters endpoint (minimal, avoids fanout)**
`GET /projects/activity?window=24h|7d|since_review`
Returns per project:
- `project_id`
- `events_count` (or `docs_count` if that’s the canonical metric)
- `last_activity_at` (optional redundancy)

Rules:
- `since_review` uses `last_reviewed_at`; if null, fall back to 7d window.
- If project created less than window length and you have created_at available, you may cap start time at created_at; otherwise ignore.

If you already have a global “commits/docs/events” table keyed by project_id, implement this as a single aggregate query.

### Health endpoint behavior
Continue existing:
- `apiStore.getHealth()`
Binary display:
- ok → “Healthy”
- not ok → “Error”
If endpoint fails:
- show “Unknown” (neutral), do not break layout.

---

## 3) UX Structure (Final)

### Section order
1) Header
2) Instance Summary Strip (compact)
3) Window Switcher (segmented control)
4) Pinned Projects
5) Recent Projects
6) Quick Action (New Project only)

### Empty states
- No projects:
  - show a single card: “No projects yet” + primary button “Create Project”
- No pinned projects (but some exist):
  - show pinned section header + helper text: “Pin projects to keep them here.”

---

## 4) Window Switcher (Explicit UX)

Control: segmented buttons
- 24h
- 7d
- Since last review

Applies to:
- the per-project “New events” count displayed on each card

Does not apply to:
- project ordering
- instance summary strip

---

## 5) Project Card Spec (Pinned + Recent)

### Visual hierarchy
- Top row:
  - **Project Name** (bold)
  - Pin toggle (star icon button)
- Second row (muted):
  - Project ID
- Body rows:
  - Topic label
  - Sources count
  - Last activity (relative + absolute minute)
  - Last reviewed (relative + absolute minute, or “Never reviewed”)

### “Changed since” row (depends on window)
- Label:
  - “New events (24h)” / “New events (7d)” / “New events (since review)”
- Value:
  - numeric from `/projects/activity?window=...`
  - if missing (should not be missing this sprint), show “n/a”

### Actions
- Primary button: “Open” → `/projects/:id`
- Secondary button: “Reviewed now”
  - always available
  - on click:
    - optimistic UI update allowed (set last_reviewed_at immediately)
    - then POST review
    - if POST fails: revert and show inline error on that card (“Failed to mark reviewed. Retry”)
  - success feedback:
    - no toast required; updating “Last reviewed: just now” is sufficient

### Pin toggle behavior
- Clicking star:
  - optimistic toggle
  - PATCH pinned
  - revert + inline error if fails

Accessibility:
- pin button has `aria-pressed`
- window switcher buttons have `aria-current` or role=tablist/tab (either acceptable)

---

## 6) Ordering Rules

### Pinned section
- Show only pinned projects.
- Order:
  1) most recent `last_activity_at` desc (null last)
  2) then name asc

### Recent section
- Show unpinned projects only.
- Order:
  1) `last_activity_at` desc (null last)
  2) then name asc
- Limit:
  - show top 6 (configurable constant)

---

## 7) Instance Summary Strip Spec (Compact)

Metrics (locked):
- Projects (count)
- Curated Docs (count)
- Commits (count)
- Health (Healthy/Error/Unknown)

Formatting:
- single card with 4 columns on desktop
- 2×2 grid on mobile
- icons optional; if used, keep current lucide icons

If counts are unavailable or error:
- show “—” placeholder

---

## 8) Quick Actions (Locked)
Only:
- New Project
  - link: `/projects`
No other actions on Dashboard.

---

## 9) Implementation Plan (Concrete)

### Home.vue changes
Remove:
- `activeConfig` and “Project” card
- Run Batch and Search quick actions

Add state:
- `windowMode = ref<'24h'|'7d'|'since_review'>('24h')`
- `projects = ref<ProjectListItem[]>([])`
- `activityByProject = ref<Record<string, { events_count: number }>>({})`
- `loadingProjects`, `loadingActivity`

On mount:
- `listConfigs()` (or `GET /projects`) → populate projects
- `getHealth()` → populate health
- `getStats()` (if exists) else compute:
  - projects count from list
  - docs/commits from existing stats endpoints if available; otherwise leave as 0/—

On windowMode change:
- fetch `/projects/activity?window=${windowMode}` and set `activityByProject`

Computed:
- `pinnedProjects`
- `recentProjects`

Actions:
- `togglePin(projectId, nextPinned)`
- `markReviewed(projectId)`

Staged rendering:
- render sections with skeleton rows while loading activity

### Performance constraint
- Do not call inspect or listRuns on Dashboard.
- Only the one activity endpoint + projects list.

---

## 10) Testing (Must-have)
1) Window switching refetches activity and updates counts.
2) Pin toggle persists and re-sorts cards.
3) Reviewed now persists and updates “since review” behavior (count should reset to near 0 on next fetch).
4) Empty states render correctly.
5) Health endpoint failure → “Unknown” only.

---

## 11) Acceptance Criteria (Updated)
- Dashboard contains: summary strip, window switcher, pinned projects, recent projects, new project action.
- No “Active project”.
- No run/search actions.
- Per-project “Reviewed now” works and persists.
- Pinning works and persists.
- No fanout API calls on Dashboard.