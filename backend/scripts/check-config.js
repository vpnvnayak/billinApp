#!/usr/bin/env node
// scripts/check-config.js
// Run in CI to validate required environment variables for production
const required = [
  'NODE_ENV',
  'DATABASE_URL',
  'JWT_SECRET',
  'COOKIE_SECURE',
  'ALLOWED_ORIGINS'
]

function fail(msg) {
  console.error('CONFIG CHECK FAILED:', msg)
  process.exit(2)
}

for (const k of required) {
  const v = process.env[k]
  if (!v) fail(`${k} is not set`)
}

if (process.env.NODE_ENV === 'production') {
  if (process.env.JWT_SECRET === 'dev-secret') fail('JWT_SECRET must not be the dev-secret in production')
  if (process.env.COOKIE_SECURE !== 'true') fail('COOKIE_SECURE must be true in production')
}

console.log('Config check passed')
process.exit(0)
