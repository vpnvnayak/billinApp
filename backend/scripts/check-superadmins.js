#!/usr/bin/env node
const db = require('../src/db')
;(async ()=>{
  try {
    const us = await db.query('SELECT id,email FROM users ORDER BY id')
    console.log('users count:', us.rows.length)
    console.log('sample users (first 10):', us.rows.slice(0,10))
    const r = await db.query("SELECT id FROM roles WHERE name='superadmin'")
    const roleId = r.rows[0] && r.rows[0].id
    if (!roleId) { console.log('superadmin role not present'); process.exit(0) }
    const ur = await db.query('SELECT count(*) cnt FROM user_roles WHERE role_id=$1', [roleId])
    console.log('user_roles with superadmin role:', ur.rows[0].cnt)
    const tokens = await db.query('SELECT count(*) cnt FROM refresh_tokens WHERE user_id IN (SELECT id FROM users)')
    console.log('refresh_tokens count for existing users:', tokens.rows[0].cnt)
    process.exit(0)
  } catch (e) {
    console.error(e && e.message)
    process.exit(2)
  }
})()
