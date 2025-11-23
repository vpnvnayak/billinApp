#!/usr/bin/env node
/**
 * Remove sample/hardcoded rows previously inserted by seed-system-logs.js
 * This deletes rows that match the known seed messages. Run from repo root:
 *   node backend/scripts/clear-seeded-system-logs.js
 */
const db = require('../src/db')

const seededMessages = [
  'Processed POS sale',
  'Added new stock',
  'Adjusted stock levels',
  'Created new customer',
  'User login failed'
]

async function run() {
  try {
    const r = await db.query('DELETE FROM system_logs WHERE message = ANY($1::text[]) RETURNING id, level, message, meta, created_at', [seededMessages])
    console.log('Deleted rows:', r.rowCount)
    if (r.rows && r.rows.length) {
      console.table(r.rows.map(rr => ({ id: rr.id, level: rr.level, message: rr.message, created_at: rr.created_at })))
    }
  } catch (e) {
    console.error('Failed to clear seeded logs', e && e.message || e)
    process.exitCode = 2
  } finally {
    try { await db.pool.end() } catch (e) {}
  }
}

if (require.main === module) run()
