const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/suppliers/aggregates - returns per-supplier aggregated metrics
router.get('/', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ data: [], total: 0 })
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10))
    const offset = (page - 1) * limit
    // total_purchases: sum of purchases.total_amount
    // credit_due: sum of (total_amount - paid) where paid is stored in metadata->paid
    // last_purchase: most recent created_at
    const hasStore = req.user && req.user.store_id
    const params = []
    // build query, scoping suppliers and joined purchases to the store when available
    let sql = `
      SELECT s.id AS supplier_id, s.name, s.phone, s.phone1, s.phone2, s.email, s.website, s.created_at,
        COALESCE(SUM(COALESCE((p.total_amount)::numeric,0)),0) AS total_purchases,
        COALESCE(SUM(
          CASE
            WHEN (p.metadata->>'paid') ~ '^[0-9]+(\.[0-9]+)?$' THEN (COALESCE((p.total_amount)::numeric,0) - (p.metadata->>'paid')::numeric)
            ELSE COALESCE((p.total_amount)::numeric,0)
          END
        ),0) AS credit_due,
        MAX(p.created_at) AS last_purchase
      FROM suppliers s
    `

    if (hasStore) {
      params.push(req.user.store_id)
      // join purchases only for this store and restrict suppliers to this store
      sql += `LEFT JOIN purchases p ON p.supplier_id = s.id AND p.store_id = $${params.length}`
      sql += ` WHERE s.store_id = $${params.length}`
    } else {
      sql += `LEFT JOIN purchases p ON p.supplier_id = s.id`
    }

    sql += `\n      GROUP BY s.id, s.name, s.phone, s.phone1, s.phone2, s.email, s.website, s.created_at\n    `

    // Wrap aggregated query to apply LIMIT/OFFSET and compute total_count
    const outerSql = `SELECT t.*, COUNT(*) OVER() AS total_count FROM (${sql}) t ORDER BY t.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)
    const r = await db.query(outerSql, params)
    const total = r.rows.length ? Number(r.rows[0].total_count || 0) : 0
    const rows = r.rows.map(rr => {
      const { total_count, ...rest } = rr
      return rest
    })
    res.json({ data: rows, total })
  } catch (err) {
    console.error('Failed to compute supplier aggregates', err)
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router
