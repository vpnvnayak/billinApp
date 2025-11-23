const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

// helper to check elevated admin/store roles
function isElevated(roles) {
  if (!roles || !Array.isArray(roles)) return false
  // Strict: only superadmin and storeadmin may view system logs
  return roles.includes('superadmin') || roles.includes('storeadmin')
}

// GET /api/logs - return recent system logs. Only accessible to elevated roles.
router.get('/', requireAuth, async (req, res) => {
  if (!isElevated(req.user && req.user.roles)) return res.status(403).json({ error: 'Forbidden' })
  // pagination and filtering: page, limit, level, store_id, q (search in message)
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 50))
  const page = Math.max(1, Number(req.query.page) || 1)
  const offset = (page - 1) * limit
  const level = req.query.level ? String(req.query.level).trim().toLowerCase() : null
  const storeId = req.query.store_id ? Number(req.query.store_id) : null
  const q = req.query.q ? String(req.query.q).trim() : null

  try {
    const where = []
    const params = []
    let idx = 1
    if (level) {
      where.push(`LOWER(level) = $${idx++}`)
      params.push(level)
    }
    if (!Number.isNaN(storeId) && storeId) {
      where.push(`store_id = $${idx++}`)
      params.push(storeId)
    }
    if (q) {
      where.push(`(message ILIKE $${idx} OR meta::text ILIKE $${idx})`)
      params.push(`%${q}%`)
      idx++
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  // include new classification columns when present
  const sql = `SELECT id, level, message, meta, store_id, action_type, severity, created_at, COUNT(*) OVER() AS total_count FROM system_logs ${whereSql} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(limit, offset)
    const r = await db.query(sql, params)
    const total = r.rows.length ? Number(r.rows[0].total_count || 0) : 0
    const rows = r.rows.map(rr => {
      const { total_count, ...rest } = rr
      return rest
    })
    return res.json({ data: rows, total, page, limit })
  } catch (e) {
    // If table missing, return empty result
    if (e && e.code === '42P01') return res.json({ data: [], total: 0, page: 1, limit })
    // If columns action_type/severity don't exist on older schema, retry without them
    if (e && e.code === '42703') {
      try {
        const sql2 = `SELECT id, level, message, meta, store_id, created_at, COUNT(*) OVER() AS total_count FROM system_logs ${whereSql} ORDER BY created_at DESC LIMIT $${idx-1} OFFSET $${idx}`
        const r2 = await db.query(sql2, params)
        const total2 = r2.rows.length ? Number(r2.rows[0].total_count || 0) : 0
        const rows2 = r2.rows.map(rr => {
          const { total_count, ...rest } = rr
          return rest
        })
        return res.json({ data: rows2, total: total2, page, limit })
      } catch (er) {
        console.error('Failed to load system logs (fallback)', er)
        return res.status(500).json({ error: 'internal error' })
      }
    }
    console.error('Failed to load system logs', e)
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router

// SSE stream for live logs: GET /api/logs/stream?token=...
router.get('/stream', async (req, res) => {
  // support token via query (EventSource can't set headers easily)
  try {
    const token = req.query && req.query.token ? String(req.query.token) : (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Authorization required' })
    let payload
    try { payload = jwt.verify(token, JWT_SECRET) } catch (e) { return res.status(401).json({ error: 'Invalid token' }) }
    const roles = payload && payload.roles
    if (!roles || (!roles.includes('superadmin') && !roles.includes('storeadmin'))) return res.status(403).json({ error: 'Forbidden' })

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders && res.flushHeaders()

    // Function to write SSE event
    const writeEvent = (data) => {
      try {
        res.write(`event: log\n`)
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      } catch (e) {}
    }

    // Use a dedicated client to LISTEN so notifications are pushed
    const client = await db.pool.connect()
    const onNotification = (msg) => {
      try {
        const payload = msg && msg.payload ? JSON.parse(msg.payload) : null
        writeEvent(payload || {})
      } catch (e) {}
    }
    client.on('notification', onNotification)
    try { await client.query('LISTEN system_logs_channel') } catch (e) { /* ignore */ }

    // keep connection alive with a comment ping every 25s
    const ping = setInterval(() => { try { res.write(': ping\n\n') } catch (e) {} }, 25000)

    // cleanup on close
    req.on('close', async () => {
      clearInterval(ping)
      try {
        client.removeListener('notification', onNotification)
        await client.query('UNLISTEN system_logs_channel')
      } catch (e) {}
      try { client.release() } catch (e) {}
    })

  } catch (e) {
    console.error('Failed to open logs stream', e)
    try { res.status(500).end() } catch (er) {}
  }
})
