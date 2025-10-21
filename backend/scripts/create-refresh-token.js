#!/usr/bin/env node
// create-refresh-token.js
// Usage: node scripts/create-refresh-token.js --email=admin@local --days=30
// Generates a secure refresh token, inserts into refresh_tokens, and prints it.

const db = require('../src/db')
const crypto = require('crypto')
const yargs = require('yargs')

const argv = yargs.option('email', { type: 'string' }).option('days', { type: 'number' }).help().argv
const email = argv.email || process.env.ADMIN_EMAIL || 'admin@local'
const days = argv.days || 30

async function run() {
  try {
    const u = await db.query('SELECT id, email FROM users WHERE lower(email) = lower($1)', [email])
    if (u.rows.length === 0) {
      console.error('User not found:', email)
      process.exit(2)
    }
    const user = u.rows[0]
    const token = crypto.randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    await db.query('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1,$2,$3)', [token, user.id, expiresAt])
    console.log('Created refresh token for', user.email)
    console.log('token:', token)
    console.log('expiresAt:', expiresAt.toISOString())
    process.exit(0)
  } catch (e) {
    console.error('ERROR', e && e.message)
    process.exit(2)
  }
}

run()
