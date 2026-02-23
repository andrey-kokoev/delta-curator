import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'

const AUTH_TOKEN_KEY = 'dc_auth_token'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.roles.includes('admin') || false)
  const userRoles = computed(() => user.value?.roles || [])

  // Initialize from localStorage
  function initFromStorage() {
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY)
    if (storedToken) {
      token.value = storedToken
      // Try to validate/get user info with the token
      checkAuth()
    }
  }

  async function checkAuth() {
    try {
      isLoading.value = true
      
      // Include token in Authorization header if we have one
      const headers: Record<string, string> = {}
      if (token.value) {
        headers['Authorization'] = `Bearer ${token.value}`
      }
      
      const response = await fetch('/api/auth/me', { 
        headers,
        credentials: 'include'
      })
      
      if (response.ok) {
        user.value = await response.json()
      } else {
        user.value = null
        token.value = null
        localStorage.removeItem(AUTH_TOKEN_KEY)
      }
    } catch (err) {
      user.value = null
      token.value = null
      localStorage.removeItem(AUTH_TOKEN_KEY)
    } finally {
      isLoading.value = false
    }
  }

  function login() {
    window.location.href = '/api/auth/microsoft'
  }

  async function adminLogin(adminToken: string): Promise<boolean> {
    try {
      isLoading.value = true
      error.value = null
      
      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: adminToken }),
        credentials: 'include'
      })
      
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Login failed' }))
        error.value = err.error || 'Login failed'
        return false
      }
      
      const data = await response.json()
      user.value = data.user
      token.value = data.token
      
      // Store token in localStorage for persistence
      localStorage.setItem(AUTH_TOKEN_KEY, data.token)
      
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include'
      })
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      user.value = null
      token.value = null
      localStorage.removeItem(AUTH_TOKEN_KEY)
      window.location.href = '/'
    }
  }

  function hasRole(role: string): boolean {
    return userRoles.value.includes(role)
  }

  // Get auth headers for API requests
  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (token.value) {
      headers['Authorization'] = `Bearer ${token.value}`
    }
    return headers
  }

  return {
    user,
    token,
    isLoading,
    error,
    isAuthenticated,
    isAdmin,
    userRoles,
    initFromStorage,
    checkAuth,
    login,
    adminLogin,
    logout,
    hasRole,
    getAuthHeaders
  }
})
