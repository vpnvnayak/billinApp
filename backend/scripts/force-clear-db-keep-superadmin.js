#!/usr/bin/env node
// force-clear-db-keep-superadmin.js
// Forcefully truncate most tables (except 'roles' and 'migrations'), then recreate preserved superadmin users
// from the backup produced earlier (backend/backups/clear-db-*/preserve-users.json).
// This is destructive. Use only on test DBs. It writes recreated user credentials to the backup folder.

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const db = require('../src/db')

async function run() {
  // find latest clear-db backup folder
  const backupsDir = path.join(__dirname, '..', 'backups')
  const dirs = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter(x => x.startsWith('clear-db-')).sort() : []
  if (dirs.length === 0) {
    console.error('No clear-db backup folders found in backend/backups. Aborting.')
    process.exit(1)
  }
  const latest = dirs[dirs.length - 1]
  const preserveFile = path.join(backupsDir, latest, 'preserve-users.json')
  if (!fs.existsSync(preserveFile)) {
    console.error('Preserve file not found:', preserveFile)
    process.exit(1)
  }

  const preserved = JSON.parse(fs.readFileSync(preserveFile, 'utf8'))
  if (!Array.isArray(preserved) || preserved.length === 0) {
    console.error('No preserved users found in preserve file. Aborting.')
    process.exit(1)
  }

  console.log('Force clear: will recreate', preserved.length, 'preserved users from', preserveFile)

  // Generate credentials
  const creds = preserved.map(u => {
    const pwd = crypto.randomBytes(8).toString('base64')
    return { id: u.id, email: u.email, password: pwd }
  })

  // Begin destructive sequence
  try {
    // fetch list of tables
    const tablesRes = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
    const allTables = tablesRes.rows.map(r => r.table_name)
    // exclude 'roles' and 'migrations' so we keep role definitions and migration history
    const keep = new Set(['roles','migrations'])
    const toTruncate = allTables.filter(t => !keep.has(t))

    console.log('Tables to truncate:', toTruncate.join(', '))
    // Truncate in one statement (CASCADE ensures FK constraints are handled)
    if (toTruncate.length > 0) {
      await db.query(`TRUNCATE TABLE ${toTruncate.map(t => '"'+t+'"').join(', ')} CASCADE`)
      console.log('Truncated tables.')
    }

    // Recreate preserved users with explicit ids
    // Hash passwords
    for (const c of creds) {
      const hash = await bcrypt.hash(c.password, 10)
      // Insert with explicit id using INSERT ... ON CONFLICT (id) DO UPDATE
      const q = `INSERT INTO users (id, email, password_hash, full_name, created_at) VALUES ($1,$2,$3,$4, now()) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash RETURNING id`
      await db.query(q, [c.id, c.email, hash, 'Super Admin'])
    }

    // Ensure superadmin role exists
    await db.query("INSERT INTO roles (name, description) VALUES ('superadmin', 'Super administrator') ON CONFLICT (name) DO NOTHING")
    const r = await db.query("SELECT id FROM roles WHERE name='superadmin'")
    const roleId = r.rows[0].id

    // Assign role to preserved users
    for (const c of creds) {
      await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [c.id, roleId])
    }

    // Write credentials to backup folder for retrieval
    const outFile = path.join(backupsDir, latest, 'recreated-superadmin-credentials.json')
    fs.writeFileSync(outFile, JSON.stringify(creds, null, 2))
    console.log('Wrote recreated credentials to', outFile)

    console.log('Force clear completed. Preserved users recreated and assigned superadmin role.')
    process.exit(0)
  } catch (err) {
    console.error('Error during force clear:', err && err.message)
    process.exit(2)
  }
}

run()
