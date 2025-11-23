#!/usr/bin/env node
/**
 * Backfill script to populate action_type and severity columns for existing system_logs
 * Run after applying migration 044_add_action_type_and_severity_to_system_logs.sql
 */
const db = require('../src/db')
const logger = require('../src/logger')

async function backfill(batchSize = 200) {
  console.log('Starting backfill of system_logs.action_type and severity')
  try {
    let offset = 0
    while (true) {
      const r = await db.query('SELECT id, message, meta FROM system_logs WHERE (action_type IS NULL OR action_type = \'\') ORDER BY id ASC LIMIT $1 OFFSET $2', [batchSize, offset])
      if (!r.rows || r.rows.length === 0) break
      for (const row of r.rows) {
        try {
          const meta = row.meta || {}
          const { action_type, severity } = logger.classify(row.message || '', meta)
          if (action_type || severity) {
            await db.query('UPDATE system_logs SET action_type = $1, severity = $2 WHERE id = $3', [action_type || null, severity || null, row.id])
          }
        } catch (e) {
          console.warn('Failed to classify row', row.id, e && e.message || e)
        }
      }
      offset += r.rows.length
      console.log('Processed', offset, 'rows...')
    }
    console.log('Backfill complete')
  } catch (e) {
    console.error('Backfill failed', e && e.message || e)
    process.exitCode = 2
  } finally {
    try { await db.end() } catch (e) {}
  }
}

if (require.main === module) {
  const arg = process.argv[2] ? Number(process.argv[2]) : undefined
  backfill(arg).then(() => process.exit(0)).catch(() => process.exit(1))
}
