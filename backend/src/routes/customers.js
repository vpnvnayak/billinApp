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
  const sql = `SELECT id, name, phone, email, created_at, loyalty_points, COALESCE(credit_due,0)::numeric(14,2) AS credit_due, COUNT(*) OVER() AS total_count FROM customers ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
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
  const { name, phone, email, loyalty_points } = req.body || {}
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' })
    if (!phone || typeof phone !== 'string' || !phone.trim()) return res.status(400).json({ error: 'phone is required' })
    if (!process.env.DATABASE_URL) {
      return res.status(201).json({ id: Date.now(), name, phone: phone || null, email: email || null })
    }
  const storeId = req.user && req.user.store_id ? req.user.store_id : null
    // allow optionally setting initial loyalty_points during creation (integer fallback to 0)
    const lp = Number.isInteger(Number(loyalty_points)) ? Number(loyalty_points) : 0
    const r = storeId
      ? await db.query('INSERT INTO customers (name, phone, email, store_id, loyalty_points) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, phone, email, created_at, loyalty_points', [name, phone || null, email || null, storeId, lp])
      : await db.query('INSERT INTO customers (name, phone, email, loyalty_points) VALUES ($1,$2,$3,$4) RETURNING id, name, phone, email, created_at, loyalty_points', [name, phone || null, email || null, lp])
    res.status(201).json(r.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/customers/aggregates - return KPI metrics scoped to the current store (if any)
router.get('/aggregates', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.json({ total_customers: 1, active_customers_30d: 0, avg_spend: 0, new_customers_30d: 0, loyalty_members: 0 })
    }

    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    const storeWhere = storeId ? 'WHERE c.store_id = $1' : ''
    const params = storeId ? [storeId] : []

    // total customers, new in 30d, loyalty members
    const totalSql = `
      SELECT COUNT(*)::int AS total_customers,
        COALESCE(SUM(CASE WHEN c.created_at >= now() - interval '30 days' THEN 1 ELSE 0 END),0)::int AS new_customers_30d,
        COALESCE(SUM(CASE WHEN COALESCE(c.loyalty_points,0) > 0 THEN 1 ELSE 0 END),0)::int AS loyalty_members
      FROM customers c
      ${storeWhere}
    `
    const totalRes = await db.query(totalSql, params)
    const total_customers = Number((totalRes.rows[0] && totalRes.rows[0].total_customers) || 0)
    const new_customers_30d = Number((totalRes.rows[0] && totalRes.rows[0].new_customers_30d) || 0)
    const loyalty_members = Number((totalRes.rows[0] && totalRes.rows[0].loyalty_members) || 0)

  // active customers in last 30 days (customers who have sales)
  // sales table references customers via user_id (not customer_id)
  const activeSql = `SELECT COUNT(DISTINCT s.user_id)::int AS active_customers_30d FROM sales s WHERE s.user_id IS NOT NULL AND s.created_at >= now() - interval '30 days' ${storeId ? 'AND s.store_id = $1' : ''}`
    const activeRes = await db.query(activeSql, params)
    const active_customers_30d = Number((activeRes.rows[0] && activeRes.rows[0].active_customers_30d) || 0)

    // average spend per customer (average of total purchases per customer)
    const avgSql = `
      SELECT COALESCE(AVG(total),0)::numeric(14,2) AS avg_spend FROM (
        SELECT COALESCE(SUM(s.grand_total),0) AS total
        FROM customers c
        LEFT JOIN sales s ON s.user_id = c.id ${storeId ? 'AND s.store_id = $1' : ''}
        ${storeWhere}
        GROUP BY c.id
      ) t
    `
    const avgRes = await db.query(avgSql, params)
    const avg_spend = Number((avgRes.rows[0] && avgRes.rows[0].avg_spend) || 0)

    res.json({ total_customers, active_customers_30d, avg_spend, new_customers_30d, loyalty_members })
  } catch (err) {
    console.error('customers aggregates failed', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
