import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
  // Resolve packages using Node's exports map (matches NodeNext at runtime).
  resolve: { conditions: ['node'] },
})
