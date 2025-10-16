const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/customers
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.max(1, parseInt(req.query.limit) || 10)
    const q = (req.query.q || '').trim()
    if (!process.env.DATABASE_URL) {
      // fallback static data with pagination
      const all = [{ id: 1, name: 'Walk-in', phone: null, email: null }]
      const total = all.length
      const start = (page - 1) * limit
      return res.json({ data: all.slice(start, start + limit), total })
    }

    // build where clause if search provided
    let where = ''
    const params = []
    if (q) {
      params.push(`%${q}%`)
      where = `WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1`
    }
    // scope by store if user has store_id
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    if (storeId) {
      if (where) where += ' AND store_id = $' + (params.length + 1)
      else where = 'WHERE store_id = $' + (params.length + 1)
      params.push(storeId)
    }
    const offset = (page - 1) * limit
    // Use window function to get total count in same query
    const sql = `SELECT id, name, phone, email, created_at, COUNT(*) OVER() AS total_count FROM customers ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)
    const r = await db.query(sql, params)
    const total = r.rows.length ? Number(r.rows[0].total_count || 0) : 0
    const rows = r.rows.map(rr => {
      const { total_count, ...rest } = rr
      return rest
    })
    res.json({ data: rows, total })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/customers
router.post('/', async (req, res) => {
  try {
    const { name, phone, email } = req.body || {}
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' })
    if (!process.env.DATABASE_URL) {
      return res.status(201).json({ id: Date.now(), name, phone: phone || null, email: email || null })
    }
  const storeId = req.user && req.user.store_id ? req.user.store_id : null
    const r = storeId
      ? await db.query('INSERT INTO customers (name, phone, email, store_id) VALUES ($1,$2,$3,$4) RETURNING id, name, phone, email, created_at', [name, phone || null, email || null, storeId])
      : await db.query('INSERT INTO customers (name, phone, email) VALUES ($1,$2,$3) RETURNING id, name, phone, email, created_at', [name, phone || null, email || null])
    res.status(201).json(r.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
