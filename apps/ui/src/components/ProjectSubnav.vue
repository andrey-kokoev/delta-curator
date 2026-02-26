<template>
  <nav class="flex flex-row md:flex-col gap-1 overflow-x-auto w-full md:w-48 shrink-0 pb-2 md:pb-0">
    <RouterLink
      v-for="item in items"
      :key="item.path"
      :to="item.path"
      :class="[
        'rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
        isActive(item.path)
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      ]"
    >
      {{ item.label }}
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  projectId: string
}>()

const route = useRoute()

const items = computed(() => [
  { label: 'Overview', path: `/projects/${props.projectId}` },
  { label: 'Sources', path: `/projects/${props.projectId}/sources` },
  { label: 'Content', path: `/projects/${props.projectId}/content` },
  { label: 'Search', path: `/projects/${props.projectId}/search` },
  { label: 'Run', path: `/projects/${props.projectId}/run` },
  { label: 'Inspect', path: `/projects/${props.projectId}/inspect` }
])

function isActive(path: string): boolean {
  return route.path === path
}
</script>
