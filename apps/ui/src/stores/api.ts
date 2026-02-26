import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import type {
  ProjectConfig,
  ProjectIndex,
  ProjectListItem,
  ProjectActivity,
  SearchResult,
  HealthStatus,
  RunResult,
  InspectResult,
  SourceRunsResult
} from '@/types'

// API base URL from environment
const API_BASE = import.meta.env.VITE_API_URL || ''

export const useApiStore = defineStore('api', () => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  function getAuthHeaders(): Record<string, string> {
    const authStore = useAuthStore()
    return authStore.getAuthHeaders()
  }

  async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    isLoading.value = true
    error.value = null

    try {
      const url = `${API_BASE}${path}`
      const authHeaders = getAuthHeaders()

      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...options?.headers
        }
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || `HTTP ${response.status}`)
      }

      return await response.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const projectCache = ref<Record<string, { config: ProjectConfig; index: ProjectIndex }>>({})

  // Config API
  async function listConfigs(): Promise<{ configs: ProjectIndex[] }> {
    return fetchApi('/config')
  }

  async function getConfig(projectId: string): Promise<{ config: ProjectConfig; index: ProjectIndex }> {
    const res = await fetchApi<{ config: ProjectConfig; index: ProjectIndex }>(`/config/${projectId}`)
    projectCache.value[projectId] = res
    return res
  }

  async function getActiveConfig(): Promise<{ config: ProjectConfig; index: ProjectIndex }> {
    const res = await fetchApi<{ config: ProjectConfig; index: ProjectIndex }>('/config/active')
    if (res.config?.project_id) {
      projectCache.value[res.config.project_id] = res
    }
    return res
  }

  async function saveConfig(config: ProjectConfig, activate = false): Promise<{
    success: boolean
    project_id: string
    r2_key: string
    hash: string
    active: boolean
  }> {
    return fetchApi(`/config?activate=${activate}`, {
      method: 'POST',
      body: JSON.stringify(config)
    })
  }

  async function activateConfig(projectId: string): Promise<{
    success: boolean
    project_id: string
  }> {
    return fetchApi(`/config/${projectId}/activate`, { method: 'POST' })
  }

  async function deleteConfig(projectId: string): Promise<{
    success: boolean
    project_id: string
  }> {
    return fetchApi(`/config/${projectId}`, { method: 'DELETE' })
  }

  // Operations API
  async function runBatch(sourceId: string, maxItems = 50, projectId?: string): Promise<RunResult> {
    return fetchApi('/run', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, max_items: maxItems, project_id: projectId, once: true })
    })
  }

  async function updateSourceCursor(
    sourceId: string,
    cursorPublishedAt: string | null,
    clearRecentGuids = true,
    projectId?: string
  ): Promise<{
    success: boolean
    project_id?: string
    source_id: string
    cursor_published_at: string | null
    recent_guids_count: number
    commit_id: string
    trace_id: string
  }> {
    return fetchApi('/sources/cursor', {
      method: 'POST',
      body: JSON.stringify({
        source_id: sourceId,
        project_id: projectId,
        cursor_published_at: cursorPublishedAt,
        clear_recent_guids: clearRecentGuids
      })
    })
  }

  async function resetProcessedUrls(
    sourceId: string,
    projectId?: string
  ): Promise<{
    success: boolean
    project_id: string
    source_id: string
    deleted_count: number
  }> {
    return fetchApi('/sources/processed-urls/reset', {
      method: 'POST',
      body: JSON.stringify({
        source_id: sourceId,
        project_id: projectId
      })
    })
  }

  async function search(query: string, k = 20, rerank = true): Promise<SearchResult> {
    return fetchApi(`/search?q=${encodeURIComponent(query)}&k=${k}&rerank=${rerank}`)
  }

  async function searchScoped(
    query: string,
    options?: {
      k?: number
      rerank?: boolean
      projectId?: string
      sourceId?: string
    }
  ): Promise<SearchResult> {
    const k = options?.k ?? 20
    const rerank = options?.rerank ?? true
    const params = new URLSearchParams({
      q: query,
      k: String(k),
      rerank: String(rerank)
    })

    if (options?.projectId) {
      params.set('project_id', options.projectId)
    }
    if (options?.sourceId) {
      params.set('source_id', options.sourceId)
    }

    return fetchApi(`/search?${params.toString()}`)
  }

  async function listContent(options?: {
    k?: number
    projectId?: string
    sourceId?: string
  }): Promise<SearchResult> {
    return searchScoped('', {
      k: options?.k ?? 100,
      rerank: false,
      projectId: options?.projectId,
      sourceId: options?.sourceId
    })
  }

  async function inspect(
    since = 'PT24H',
    format: 'markdown' | 'json' = 'markdown',
    projectId?: string
  ): Promise<string | InspectResult> {
    const authHeaders = getAuthHeaders()
    const params = new URLSearchParams({ since, format })
    if (projectId) {
      params.set('project_id', projectId)
    }

    const response = await fetch(`${API_BASE}/inspect?${params.toString()}`, {
      credentials: 'include',
      headers: authHeaders
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(err.error || `HTTP ${response.status}`)
    }

    if (format === 'markdown') {
      return response.text()
    }
    return response.json() as Promise<InspectResult>
  }

  async function listRuns(options: {
    projectId: string
    sourceId?: string
    limit?: number
  }): Promise<SourceRunsResult> {
    const params = new URLSearchParams({
      project_id: options.projectId,
      limit: String(options.limit ?? 5)
    })

    if (options.sourceId) {
      params.set('source_id', options.sourceId)
    }

    return fetchApi(`/runs?${params.toString()}`)
  }

  async function getHealth(): Promise<HealthStatus> {
    return fetchApi('/health')
  }

  // Seed
  async function seedConfig(activate = true): Promise<{
    success: boolean
    project_id?: string
    already_exists?: boolean
  }> {
    return fetchApi(`/seed?activate=${activate}`, { method: 'POST' })
  }

  // Projects API (Dashboard)
  async function listProjects(): Promise<{ projects: ProjectListItem[] }> {
    return fetchApi('/projects')
  }

  async function getProjectActivity(
    window: '24h' | '7d' | 'since_review'
  ): Promise<{ activity: ProjectActivity[] }> {
    return fetchApi(`/projects/activity?window=${window}`)
  }

  async function markProjectReviewed(projectId: string): Promise<{
    success: boolean
    project: ProjectListItem
  }> {
    return fetchApi(`/projects/${projectId}/review`, { method: 'POST' })
  }

  async function updateProject(
    projectId: string,
    updates: { pinned?: boolean }
  ): Promise<{ success: boolean; project: ProjectListItem }> {
    return fetchApi(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
  }

  // Instance stats for dashboard
  async function getInstanceStats(): Promise<{
    projects: number
    docs: number
    commits: number
  }> {
    // Get projects count
    const projectsRes = await listProjects()
    const projects = projectsRes.projects.length

    // Try to get docs and commits counts from health or other endpoints
    // For now, return 0 for docs and commits as they require aggregation
    return { projects, docs: 0, commits: 0 }
  }

  return {
    isLoading,
    error,
    projectCache,
    listConfigs,
    getConfig,
    getActiveConfig,
    saveConfig,
    activateConfig,
    deleteConfig,
    runBatch,
    updateSourceCursor,
    resetProcessedUrls,
    search,
    searchScoped,
    listContent,
    inspect,
    listRuns,
    getHealth,
    seedConfig,
    listProjects,
    getProjectActivity,
    markProjectReviewed,
    updateProject,
    getInstanceStats
  }
})
