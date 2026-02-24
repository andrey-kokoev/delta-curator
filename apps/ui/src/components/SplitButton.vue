<template>
  <div class="relative inline-flex split-button-container">
    <!-- Primary Button -->
    <button
      @click="$emit('primary')"
      class="flex items-center gap-2 rounded-l-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
      :disabled="disabled"
    >
      <slot name="primary-icon">
        <Plus class="h-4 w-4" />
      </slot>
      <slot name="primary-text">Primary</slot>
    </button>

    <!-- Dropdown Toggle -->
    <button
      @click="toggleDropdown"
      class="flex items-center rounded-r-lg border-l border-primary-foreground/20 bg-primary px-2 py-2 text-primary-foreground hover:bg-primary/90"
      :disabled="disabled"
    >
      <ChevronDown class="h-4 w-4" />
    </button>

    <!-- Dropdown Menu -->
    <div
      v-if="showDropdown"
      class="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-lg"
      @click.stop
    >
      <button
        @click="handleSecondary"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      >
        <slot name="secondary-icon">
          <Edit class="h-4 w-4" />
        </slot>
        <slot name="secondary-text">Secondary</slot>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Plus, ChevronDown, Edit } from 'lucide-vue-next'

interface Props {
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<{
  primary: []
  secondary: []
}>()

const showDropdown = ref(false)

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function handleSecondary() {
  showDropdown.value = false
  emit('secondary')
}

function handleClickOutside(event: Event) {
  const target = event.target as HTMLElement
  if (!target.closest('.split-button-container')) {
    showDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>