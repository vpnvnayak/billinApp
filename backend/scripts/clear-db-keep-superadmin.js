#!/usr/bin/env node
// clear-db-keep-superadmin.js
// Safely clear most of the database while preserving superadmin user(s) and role metadata.
// Dry-run by default. Use --apply --yes to actually perform destructive actions.
// Usage:
//   node scripts/clear-db-keep-superadmin.js             # dry-run
//   node scripts/clear-db-keep-superadmin.js --apply --yes    # perform truncation
//   node scripts/clear-db-keep-superadmin.js --keep-email=you@host --apply --yes

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const db = require('../src/db')
const fs = require('fs')

function parseArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--keep-email=')) args.keepEmail = a.split('=')[1]
    else if (a === '--apply') args.apply = true
    else if (a === '--yes') args.yes = true
    else if (a.startsWith('--')) {
      const [k,v] = a.replace(/^--/,'').split('=')
      args[k] = v || true
    }
  }
  return args
}

async function run() {
  const argv = parseArgs()
  const APPLY = !!argv.apply
  const CONFIRM = !!argv.yes
  const KEEP_EMAIL = argv.keepEmail || null

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Aborting.')
    process.exit(1)
  }

  console.log('clear-db-keep-superadmin.js starting', APPLY ? '(APPLY MODE)' : '(dry-run)')

  // find superadmin role id
  const r = await db.query("SELECT id FROM roles WHERE name = 'superadmin'")
  if (r.rows.length === 0) {
    console.error('No superadmin role found. Create superadmin role and user first (run create-superadmin.js). Aborting.')
    process.exit(2)
  }
  const superRoleId = r.rows[0].id

  // find users to preserve
  let supUsersQuery = `SELECT u.id, u.email FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role_id = $1`
  const supParams = [superRoleId]
  if (KEEP_EMAIL) {
    supUsersQuery += ' AND lower(u.email) = lower($2)'
    supParams.push(KEEP_EMAIL)
  }
  const supRes = await db.query(supUsersQuery, supParams)
  if (supRes.rows.length === 0) {
    console.error('No superadmin users found matching criteria. Aborting.')
    console.error('If you want to keep a particular email, pass --keep-email=you@host')
    process.exit(2)
  }
  const keepUserIds = supRes.rows.map(r => r.id)
  console.log('Will preserve superadmin user ids:', keepUserIds.map(String).join(', '))

  // list all tables in public schema
  const tablesRes = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
  const allTables = tablesRes.rows.map(r => r.table_name)

  // tables to keep
  const keepTables = new Set(['roles','users','user_roles','migrations'])
  // always keep migrations table if present; otherwise it's fine

  // compute tables to truncate/delete
  const toClear = allTables.filter(t => !keepTables.has(t))

  // gather counts in dry-run
  const counts = {}
  for (const t of allTables) {
    try {
      const c = await db.query(`SELECT COUNT(*)::int AS c FROM ${t}`)
      counts[t] = Number(c.rows[0].c)
    } catch (e) {
      counts[t] = null
    }
  }

  console.log('\nDatabase tables summary:')
  for (const t of allTables) {
    const val = counts[t] === null ? 'N/A' : counts[t]
    console.log(` - ${t}: ${val}${keepTables.has(t) ? ' (preserved)' : ''}`)
  }

  console.log('\nTables that will be cleared (truncate CASCADE):')
  toClear.forEach(t => console.log(' -', t))

  if (!APPLY) {
    console.log('\nDry-run complete. To actually clear the DB run with --apply --yes')
    process.exit(0)
  }

  if (!CONFIRM) {
    console.error('\nTo actually run destructive changes you must pass --yes to confirm. Aborting.')
    process.exit(1)
  }

  // Backup minimal metadata to file (list counts + preserved user rows)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join(__dirname, '..', 'backups', `clear-db-${ts}`)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'preserve-users.json'), JSON.stringify(supRes.rows, null, 2))
  fs.writeFileSync(path.join(outDir, 'table-counts.json'), JSON.stringify(counts, null, 2))
  console.log('Wrote minimal backup metadata to', outDir)

  // Perform truncation (in a controlled order)
  try {
    // Important: TRUNCATE ... CASCADE to avoid FK issues. Do not truncate preserved tables.
    for (const t of toClear) {
      console.log('Truncating', t)
      await db.query(`TRUNCATE TABLE ${t} CASCADE`)
    }

    // Now remove any non-superadmin users/roles links
    // Remove user_roles entries for users not in keepUserIds
    if (keepUserIds.length > 0) {
      const placeholders = keepUserIds.map((_,i) => `$${i+1}`).join(',')
      await db.query(`DELETE FROM user_roles WHERE user_id NOT IN (${placeholders})`, keepUserIds)
      await db.query(`DELETE FROM users WHERE id NOT IN (${placeholders})`, keepUserIds)
    } else {
      // unlikely because we abort earlier
      await db.query('DELETE FROM user_roles')
      await db.query('DELETE FROM users')
    }

    // Ensure superadmin role exists and is assigned
    await db.query("INSERT INTO roles (name, description) VALUES ('superadmin', 'Super administrator') ON CONFLICT (name) DO NOTHING")
    const r2 = await db.query("SELECT id FROM roles WHERE name='superadmin'")
    const roleId = r2.rows[0].id
    for (const uid of keepUserIds) {
      await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, roleId])
    }

    console.log('\nDatabase cleared. Preserved superadmin user(s):', keepUserIds.join(', '))
    console.log('Minimal backup metadata is in', outDir)
  } catch (err) {
    console.error('Error during truncate/cleanup:', err && err.message)
    console.error('Manual intervention may be required. See backups directory for metadata.')
    process.exit(2)
  }

  process.exit(0)
}

run().catch(e => {
  console.error('Fatal error', e && e.message)
  process.exit(2)
})
