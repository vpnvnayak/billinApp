#!/usr/bin/env node
// create-superadmin.js
// Usage: node scripts/create-superadmin.js --email you@host --password YourPass123
// Or set ADMIN_EMAIL and ADMIN_PASSWORD env vars.

const db = require('../src/db')
const bcrypt = require('bcrypt')

function parseArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--email=')) args.email = a.split('=')[1]
    else if (a.startsWith('--password=')) args.password = a.split('=')[1]
    else if (a === '--email') args.email = process.argv[++i]
    else if (a === '--password') args.password = process.argv[++i]
  }
  return args
}

async function run() {
  const argv = parseArgs()
  const email = argv.email || process.env.ADMIN_EMAIL || 'admin@local'
  const password = argv.password || process.env.ADMIN_PASSWORD || 'ChangeMe123!'

  try {
    const hash = await bcrypt.hash(password, 10)
    // ensure roles exist (superadmin)
    await db.query("INSERT INTO roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", ['superadmin', 'Super administrator'])

    // insert user
    const res = await db.query('INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id, email', [email, hash, 'Super Admin'])
    const user = res.rows[0]
    // get role id
    const r = await db.query('SELECT id FROM roles WHERE name = $1', ['superadmin'])
    if (r.rows.length === 0) throw new Error('superadmin role missing')
    const roleId = r.rows[0].id
    await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.id, roleId])

  console.log('Created superadmin:', { id: user.id, email })
  console.log('Note: password was set during creation. If you provided one via CLI or env, store it securely. The script will not print passwords to stdout for security.')
    process.exit(0)
  } catch (e) {
    console.error('Failed to create superadmin:', e && e.message)
    process.exit(2)
  }
}

run()
