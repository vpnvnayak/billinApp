#!/usr/bin/env node
/**
 * Inspect system_logs to help debug why action_type isn't showing in the UI.
 * Prints counts and sample rows (action_type, severity, created_at, message).
 *
 * Run with: node backend/scripts/inspect-system-logs.js
 */
const db = require('../src/db')

async function inspect() {
  try {
    const totalR = await db.query('SELECT COUNT(*)::int AS c FROM system_logs')
    const nullR = await db.query("SELECT COUNT(*)::int AS c FROM system_logs WHERE action_type IS NULL OR action_type = ''")
    console.log('total rows:', totalR.rows[0].c)
    console.log('rows with NULL/empty action_type:', nullR.rows[0].c)

    console.log('\nRecent rows (showing action_type, severity, created_at, message):')
    const r = await db.query('SELECT id, action_type, severity, created_at, message, meta FROM system_logs ORDER BY created_at DESC LIMIT 20')
    for (const row of r.rows) {
      console.log(`id=${row.id} action_type=${row.action_type || '<null>'} severity=${row.severity || '<null>'} created=${row.created_at}`)
      console.log('  message:', (row.message || '').toString().slice(0, 200))
      if (row.meta) console.log('  meta:', JSON.stringify(row.meta).slice(0, 400))
    }

  } catch (e) {
    console.error('Failed to inspect system_logs', e && e.message || e)
    process.exitCode = 2
  } finally {
    try { await db.pool.end() } catch (e) {}
  }
}

if (require.main === module) inspect()
