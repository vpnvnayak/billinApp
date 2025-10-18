#!/usr/bin/env node
const db = require('../src/db')

async function run() {
  try {
    const res = await db.query("SELECT id, email, full_name, created_at FROM users WHERE lower(email) = lower($1)", ['admin@local'])
    console.log(JSON.stringify(res.rows, null, 2))
    process.exit(0)
  } catch (e) {
    console.error('ERROR', e && e.message)
    process.exit(2)
  }
}

run()
