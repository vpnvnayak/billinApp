const db = require('./db')

const cache = { initialized: false, columns: {} }

async function init() {
  if (cache.initialized) return cache
  try {
    const res = await db.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'")
    for (const r of res.rows) {
      const t = r.table_name
      if (!cache.columns[t]) cache.columns[t] = new Set()
      cache.columns[t].add(r.column_name)
    }
    cache.initialized = true
  } catch (e) {
    console.warn('schemaCache init failed', e && e.message)
  }
  return cache
}

function hasColumn(table, column) {
  if (!cache.initialized) return false
  return !!(cache.columns[table] && cache.columns[table].has(column))
}

module.exports = { init, hasColumn, cache }
