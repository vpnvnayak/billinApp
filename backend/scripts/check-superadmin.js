#!/usr/bin/env node
// check-superadmin.js
// Prints users with the 'superadmin' role and counts refresh tokens.

const db = require('../src/db')

async function run() {
  try {
    const sup = await db.query(`
      SELECT u.id, u.email, u.full_name, u.store_id, u.created_at, u.password_hash
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'superadmin'
    `)
    console.log('superadmin users found:', sup.rows.length)
    for (const row of sup.rows) {
      // redact sensitive fields
      const safe = Object.assign({}, row)
      if (safe.password_hash) safe.password_hash = '[REDACTED]'
      console.log(safe)
    }

    const rt = await db.query('SELECT COUNT(*) AS c FROM refresh_tokens')
    console.log('refresh_tokens count:', rt.rows[0].c)

    process.exit(0)
  } catch (e) {
    console.error('error:', e && e.message)
    process.exit(2)
  }
}

run()
