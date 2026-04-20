import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/app/**/*.test.ts',
      'apps/*/__tests__/**/*.test.ts',
      'apps/*/lib/**/*.test.ts',
    ],
  },
})
