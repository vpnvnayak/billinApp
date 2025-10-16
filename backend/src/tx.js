const db = require('./db')
const metrics = require('./metrics')

async function runTransaction(fn, opts = {}) {
  const client = await db.pool.connect()
  const start = Date.now()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    const dur = Date.now() - start
    metrics.recordTransaction(dur, { ok: true, ...opts })
    return result
  } catch (err) {
    try { await client.query('ROLLBACK') } catch (e) { console.warn('rollback failed', e && e.message) }
    const dur = Date.now() - start
    metrics.recordTransaction(dur, { ok: false, error: err && err.message, ...opts })
    throw err
  } finally {
    client.release()
  }
}

module.exports = { runTransaction }
