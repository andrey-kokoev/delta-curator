import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

type ThemePreference = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const THEME_KEY = 'dc_theme_preference'

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>('system')
  const systemTheme = ref<ResolvedTheme>('light')

  let mediaQuery: MediaQueryList | null = null
  let mediaListener: ((event: MediaQueryListEvent) => void) | null = null

  const resolvedTheme = computed<ResolvedTheme>(() => {
    if (preference.value === 'system') return systemTheme.value
    return preference.value
  })

  const isDark = computed(() => resolvedTheme.value === 'dark')

  function applyTheme(theme: ResolvedTheme) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }

  function updateSystemTheme() {
    if (!mediaQuery) return
    systemTheme.value = mediaQuery.matches ? 'dark' : 'light'
  }

  function setThemePreference(next: ThemePreference) {
    preference.value = next
    localStorage.setItem(THEME_KEY, next)
    applyTheme(resolvedTheme.value)
  }

  function toggleTheme() {
    const next: ThemePreference = resolvedTheme.value === 'dark' ? 'light' : 'dark'
    setThemePreference(next)
  }

  function initTheme() {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      preference.value = stored
    }

    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    updateSystemTheme()

    if (!mediaListener) {
      mediaListener = () => {
        updateSystemTheme()
        if (preference.value === 'system') {
          applyTheme(resolvedTheme.value)
        }
      }
      mediaQuery.addEventListener('change', mediaListener)
    }

    applyTheme(resolvedTheme.value)
  }

  return {
    preference,
    resolvedTheme,
    isDark,
    initTheme,
    setThemePreference,
    toggleTheme,
  }
})
