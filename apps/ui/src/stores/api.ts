import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { 
  ProjectConfig, 
  ProjectIndex, 
  SearchResult, 
  HealthStatus,
  RunResult 
} from '@/types'

export const useApiStore = defineStore('api', () => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
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

  // Config API
  async function listConfigs(): Promise<{ configs: ProjectIndex[] }> {
    return fetchApi('/config')
  }

  async function getConfig(projectId: string, version?: string): Promise<{ config: ProjectConfig; index: ProjectIndex }> {
    const url = version ? `/config/${projectId}?version=${version}` : `/config/${projectId}`
    return fetchApi(url)
  }

  async function getActiveConfig(): Promise<{ config: ProjectConfig; index: ProjectIndex }> {
    return fetchApi('/config/active')
  }

  async function saveConfig(config: ProjectConfig, activate = false): Promise<{ 
    success: boolean
    project_id: string
    version: string
    r2_key: string
    hash: string
    active: boolean
  }> {
    return fetchApi(`/config?activate=${activate}`, {
      method: 'POST',
      body: JSON.stringify(config)
    })
  }

  async function activateConfig(projectId: string, version?: string): Promise<{ 
    success: boolean
    project_id: string
    version?: string
  }> {
    const url = version 
      ? `/config/${projectId}/activate?version=${version}` 
      : `/config/${projectId}/activate`
    return fetchApi(url, { method: 'POST' })
  }

  async function deleteConfig(projectId: string, version: string): Promise<{ 
    success: boolean
    project_id: string
    version: string
  }> {
    return fetchApi(`/config/${projectId}/${version}`, { method: 'DELETE' })
  }

  // Operations API
  async function runBatch(sourceId: string, maxItems = 50): Promise<RunResult> {
    return fetchApi('/run', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, max_items: maxItems, once: true })
    })
  }

  async function search(query: string, k = 20, rerank = true): Promise<SearchResult> {
    return fetchApi(`/search?q=${encodeURIComponent(query)}&k=${k}&rerank=${rerank}`)
  }

  async function inspect(since = 'PT24H', format: 'markdown' | 'json' = 'markdown'): Promise<string | { markdown: string }> {
    const response = await fetch(`/inspect?since=${since}&format=${format}`)
    if (format === 'markdown') {
      return response.text()
    }
    return response.json()
  }

  async function getHealth(): Promise<HealthStatus> {
    return fetchApi('/health')
  }

  // Seed
  async function seedConfig(activate = true): Promise<{
    success: boolean
    project_id?: string
    version?: string
    already_exists?: boolean
  }> {
    return fetchApi(`/seed?activate=${activate}`, { method: 'POST' })
  }

  return {
    isLoading,
    error,
    listConfigs,
    getConfig,
    getActiveConfig,
    saveConfig,
    activateConfig,
    deleteConfig,
    runBatch,
    search,
    inspect,
    getHealth,
    seedConfig
  }
})
