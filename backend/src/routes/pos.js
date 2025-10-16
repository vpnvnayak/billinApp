const express = require('express')
const router = express.Router()
const db = require('../db')
const v = require('../validators')

// GET /api/pos/products?query=&limit=
router.get('/products', async (req, res) => {
  try {
    const q = (req.query.query || '').trim()
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10))

  if (!Number.isInteger(limit) || limit <= 0) return res.status(400).json({ error: 'invalid limit' })

    if (!v.isValidQueryLength(q)) return res.status(400).json({ error: 'query too long' })

    const fallback = [
      { id: 1, sku: '0001', name: 'Milk 1L', price: 1.5, mrp: null, unit: 'L', tax_percent: 0, stock: 20 },
      { id: 2, sku: '0002', name: 'Bread', price: 1.0, mrp: null, unit: 'Nos', tax_percent: 0, stock: 30 },
    ]

    if (!process.env.DATABASE_URL) {
      if (!q) return res.json(fallback.slice(0, limit))
      const qq = q.toLowerCase()
    if (q.length > 200) return res.status(400).json({ error: 'query too long' })

      return res.json(fallback.filter(p => String(p.sku).toLowerCase().includes(qq) || (p.name || '').toLowerCase().includes(qq)).slice(0, limit))
    }

    if (!q) {
      const storeId = req.user && req.user.store_id ? req.user.store_id : null
      const r = storeId
        ? await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE store_id = $1 LIMIT $2', [storeId, limit])
        : await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products LIMIT $1', [limit])
      return res.json(r.rows)
    }

    // use ILIKE for case-insensitive partial match
    // escape % and _ to avoid unintended wildcard matches
    const term = `%${v.escapeLike(q)}%`
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    const r = storeId
      ? await db.query(`SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE (sku ILIKE $1 OR name ILIKE $1) AND store_id = $2 LIMIT $3`, [term, storeId, limit])
      : await db.query(`SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE sku ILIKE $1 OR name ILIKE $1 LIMIT $2`, [term, limit])
    res.json(r.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
