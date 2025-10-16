#!/usr/bin/env node
// Script: clear-db.js
// Deletes application data while preserving roles and superadmin user(s).
// Usage: node scripts/clear-db.js --yes
// Or set environment variable CLEAR_DB_CONFIRM=yes

const db = require('../src/db')

async function run() {
  const confirm = process.env.CLEAR_DB_CONFIRM === 'yes' || process.argv.includes('--yes')
  if (!confirm) {
    console.error('Aborting: pass --yes or set CLEAR_DB_CONFIRM=yes to actually run this script.')
    process.exit(1)
  }

  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')

    // Find superadmin user ids to preserve
    const supRes = await client.query(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'superadmin'
    `)
    const preserveIds = supRes.rows.map(r => r.id)

    console.log('Preserving superadmin user ids:', preserveIds)

    // Delete dependent data first (children)
    const deleteOrder = [
      'DELETE FROM sale_items',
      'DELETE FROM sales',
      'DELETE FROM purchase_items',
      'DELETE FROM purchases',
      'DELETE FROM products',
      'DELETE FROM suppliers',
      'DELETE FROM customers',
      // store settings: keep id=1 (global/default) if present
      "DELETE FROM store_settings WHERE id IS NOT NULL AND id <> 1",
      'DELETE FROM stores',
    ]

    for (const sql of deleteOrder) {
      await client.query(sql)
      console.log('Executed:', sql)
    }

    // Remove user_roles for non-preserved users, keep role rows intact
    if (preserveIds.length > 0) {
      await client.query('DELETE FROM user_roles WHERE user_id NOT IN (' + preserveIds.map((_,i) => '$' + (i+1)).join(',') + ')', preserveIds)
      await client.query('DELETE FROM users WHERE id NOT IN (' + preserveIds.map((_,i) => '$' + (i+1)).join(',') + ')', preserveIds)
    } else {
      // No superadmin found: remove all users and user_roles
      await client.query('DELETE FROM user_roles')
      await client.query('DELETE FROM users')
    }

    await client.query('COMMIT')
    console.log('Database cleared (preserved superadmin credentials and roles).')
    process.exit(0)
  } catch (err) {
    console.error('Error during clear-db:', err && err.message)
    try { await client.query('ROLLBACK') } catch (e) {}
    process.exit(2)
  } finally {
    client.release()
  }
}

run()
