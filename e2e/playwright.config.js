// Playwright config for billingApp e2e
const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 5000 },
  use: {
    headless: true,
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
})
