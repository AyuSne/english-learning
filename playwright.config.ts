import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  projects: [
    { name: 'dev', testDir: './e2e/dev' },
    { name: 'packaged', testDir: './e2e/packaged' }
  ]
})
