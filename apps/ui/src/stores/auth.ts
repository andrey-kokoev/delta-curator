import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)
  const userRoles = computed(() => user.value?.roles || [])

  async function checkAuth() {
    try {
      isLoading.value = true
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        user.value = await response.json()
      } else {
        user.value = null
      }
    } catch (err) {
      user.value = null
    } finally {
      isLoading.value = false
    }
  }

  function login() {
    window.location.href = '/api/auth/microsoft'
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      user.value = null
      window.location.href = '/'
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  function hasRole(role: string): boolean {
    return userRoles.value.includes(role)
  }

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    userRoles,
    checkAuth,
    login,
    logout,
    hasRole
  }
})
