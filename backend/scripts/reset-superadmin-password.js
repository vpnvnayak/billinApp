#!/usr/bin/env node
const db = require('../src/db')
const bcrypt = require('bcrypt')

async function run() {
  try {
    const email = 'superadmin@local'
    const pw = '123456'
    const userRes = await db.query('SELECT id,email FROM users WHERE email=$1 LIMIT 1', [email])
    if (!userRes.rows.length) {
      console.error('User not found:', email)
      process.exit(1)
    }
    const user = userRes.rows[0]
    const hash = await bcrypt.hash(pw, 10)
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, user.id])
    const del = await db.query('DELETE FROM refresh_tokens WHERE user_id=$1 RETURNING id', [user.id])
    console.log(`Updated password for user id=${user.id} (${user.email}). Deleted ${del.rowCount} refresh token(s).`)
    // show remaining token count
    const cnt = await db.query('SELECT count(*) as cnt FROM refresh_tokens WHERE user_id=$1', [user.id])
    console.log('Remaining refresh tokens for user:', cnt.rows[0].cnt)
    process.exit(0)
  } catch (err) {
    console.error('Error:', err && err.message)
    process.exit(2)
  }
}

run()
