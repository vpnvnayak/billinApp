// Jest setup helper: reset module registry, clear mocks, and reset schemaCache between tests

// Run before each test file/suite
beforeEach(() => {
  // reset module registry so require() gets a fresh module for each test
  jest.resetModules()
  // clear any mock data
  jest.clearAllMocks()

  // Reset schemaCache if present (defensive)
  try {
    // require fresh instance
    const schemaCache = require('../src/schemaCache')
    if (schemaCache && schemaCache.cache) {
      schemaCache.cache.initialized = false
      schemaCache.cache.columns = {}
    }
  } catch (e) {
    // ignore
  }
})

// After each test, ensure mocks cleared
afterEach(() => {
  jest.clearAllMocks()
})

// After all tests, try to close DB pool if present to avoid open handles
afterAll(async () => {
  try {
    const db = require('../src/db')
    if (db && db.pool && typeof db.pool.end === 'function') {
      await db.pool.end()
    }
  } catch (e) {
    // ignore
  }
})
