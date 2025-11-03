#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const db = require('../src/db')
const bcrypt = require('bcrypt')

async function run() {
  try {
    const backupsDir = path.join(__dirname, '..', 'backups')
    const dirs = fs.readdirSync(backupsDir).filter(d => d.startsWith('clear-db-')).sort()
    if (!dirs.length) {
      console.error('No clear-db backup directories found under', backupsDir)
      process.exit(1)
    }
    const latest = dirs[dirs.length - 1]
    const base = path.join(backupsDir, latest)
    console.log('Using backup directory:', base)
    const usersFile = path.join(base, 'preserve-users.json')
    const tokensFile = path.join(base, 'preserve-refresh-tokens.json')
    if (!fs.existsSync(usersFile)) { console.error('preserve-users.json not found'); process.exit(1) }
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'))
    const tokens = fs.existsSync(tokensFile) ? JSON.parse(fs.readFileSync(tokensFile, 'utf8')) : []

    console.log('Will attempt to recreate', users.length, 'user rows and', tokens.length, 'refresh tokens')

    for (const u of users) {
      const id = Number(u.id)
      const email = u.email || (`user-${id}@local`)
      // create a random password hash so account exists; admin can reset later
      const pw = Math.random().toString(36).slice(2, 12) + 'A1!'
      const hash = await bcrypt.hash(pw, 10)
      // insert minimal user row with explicit id
      try {
        await db.query('INSERT INTO users (id, email, password_hash, full_name, username, phone, created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email', [id, email, hash, null, email, null])
        console.log('Upserted user', id, email)
      } catch (e) {
        console.error('Failed to upsert user', id, e && e.message)
      }
    }

    // ensure superadmin role exists and assign it to these users
    const r = await db.query("INSERT INTO roles (name, description) VALUES ('superadmin','Super administrator') ON CONFLICT (name) DO NOTHING RETURNING id")
    const rr = await db.query("SELECT id FROM roles WHERE name='superadmin'")
    const roleId = rr.rows[0].id
    for (const u of users) {
      try {
        await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, roleId])
      } catch (e) {
        console.error('Failed to assign role for user', u.id, e && e.message)
      }
    }

    // restore refresh tokens
    for (const t of tokens) {
      try {
        await db.query('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [t.token, t.user_id, t.expires_at])
      } catch (e) {
        console.error('Failed to restore refresh token for user', t.user_id, e && e.message)
      }
    }

    // advance users sequence
    try {
      const mx = await db.query('SELECT max(id) as m FROM users')
      const maxId = (mx.rows[0] && mx.rows[0].m) || 1
      await db.query(`SELECT setval(pg_get_serial_sequence('users','id'), $1, true)`, [Number(maxId)])
      console.log('Adjusted users sequence to', maxId)
    } catch (e) {
      console.error('Failed to adjust users sequence', e && e.message)
    }

    console.log('Restore complete. You may want to inspect users, user_roles and refresh_tokens tables.')
    process.exit(0)
  } catch (err) {
    console.error('Fatal', err && err.message)
    process.exit(2)
  }
}

run()
