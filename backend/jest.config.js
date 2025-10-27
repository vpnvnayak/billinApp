module.exports = {
  testEnvironment: 'node',
  globalTeardown: '<rootDir>/tests/jestGlobalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/testSetup.js'],
  testTimeout: 20000
}
