import type { SourceRunSummary, MergedRun, InspectSourceCursor } from '@/types'

const STALE_THRESHOLD_HOURS = 48

export function isSourceStale(cursorPublishedAt: string | null): boolean {
  if (!cursorPublishedAt) return false
  const cursorDate = new Date(cursorPublishedAt)
  if (Number.isNaN(cursorDate.getTime())) return false
  
  const now = new Date()
  const diffHours = (now.getTime() - cursorDate.getTime()) / (1000 * 60 * 60)
  return diffHours > STALE_THRESHOLD_HOURS
}

export type SourceHealth = 'ok' | 'stale' | 'unknown' | 'error'

export function getSourceHealth(
  cursor: InspectSourceCursor | undefined,
  lastRun: SourceRunSummary | undefined
): SourceHealth {
  // If last run has explicit failed status
  if (lastRun?.status === 'failed') {
    return 'error'
  }
  
  // If no cursor data, status is unknown
  if (!cursor) {
    return 'unknown'
  }
  
  // If cursor exists but no published_at, it's unknown
  if (!cursor.cursor_published_at) {
    return 'unknown'
  }
  
  // Check staleness
  if (isSourceStale(cursor.cursor_published_at)) {
    return 'stale'
  }
  
  return 'ok'
}

export function mergeRunsAcrossSources(
  sourceRuns: Record<string, SourceRunSummary[]>
): MergedRun[] {
  const merged: MergedRun[] = []
  
  for (const [sourceId, runs] of Object.entries(sourceRuns)) {
    for (const run of runs) {
      merged.push({
        ...run,
        source_id: sourceId
      })
    }
  }
  
  // Sort by run_at desc (null/invalid last)
  return merged.sort((a, b) => {
    if (!a.run_at && !b.run_at) return 0
    if (!a.run_at) return 1
    if (!b.run_at) return -1
    return new Date(b.run_at).getTime() - new Date(a.run_at).getTime()
  })
}

export function formatUtcMinute(value: string | null | undefined): string {
  if (!value) return 'not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.toISOString().slice(0, 16)}Z`
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const diff = now.getTime() - then.getTime()
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

export function formatRunTime(value: string | null): string {
  if (!value) return 'unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${formatRelativeTime(date)} (${date.toISOString().slice(0, 16)}Z)`
}

export function formatRunMetric(value: number | null, kind: 'items' | 'events'): string {
  if (value === null || value === undefined) return 'n/a'
  if (value === 0) {
    return kind === 'items' ? '0 (no items fetched)' : '0 (no accepted events)'
  }
  return String(value)
}

export function getHealthBadgeClass(health: SourceHealth): string {
  switch (health) {
    case 'ok':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'stale':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'error':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 'unknown':
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

export function getHealthLabel(health: SourceHealth): string {
  switch (health) {
    case 'ok':
      return 'OK'
    case 'stale':
      return 'Stale'
    case 'error':
      return 'Error'
    case 'unknown':
    default:
      return 'Unknown'
  }
}

export function getRunStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'ok':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

export function getRunStatusLabel(status?: string): string {
  switch (status) {
    case 'ok':
      return 'OK'
    case 'failed':
      return 'Fail'
    default:
      return 'Unknown'
  }
}
