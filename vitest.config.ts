import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      '__tests__/**/*.test.ts',
      'apps/**/__tests__/**/*.test.ts',
      'packages/**/__tests__/**/*.test.ts',
      'plugins/**/__tests__/**/*.test.ts'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.opencode/**',
      '**/.git/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.opencode/**', '**/*.test.ts']
    }
  }
});
