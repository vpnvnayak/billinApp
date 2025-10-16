const express = require('express')
const router = express.Router()
const db = require('../db')
const v = require('../validators')
const schemaCache = require('../schemaCache')
const tx = require('../tx')

// GET /api/purchases - list purchases (basic)
router.get('/', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json([])
  try {
    // join supplier for convenience if available
    // If the request is authenticated and has a store_id, scope results to that store
    const hasStore = req.user && req.user.store_id
    let sql = `SELECT p.id, p.created_at, p.total_amount, p.metadata, s.id AS supplier_id, s.name AS supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id`
    const params = []
    if (hasStore) {
      sql += ` WHERE p.store_id = $1`
      params.push(req.user.store_id)
    }
    sql += ` ORDER BY p.created_at DESC LIMIT 200`
    const r = await db.query(sql, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

// GET /api/purchases/:id - detail with items
router.get('/:id', async (req, res) => {
  const { id } = req.params
  if (!process.env.DATABASE_URL) return res.json({ id, items: [] })
  try {
    // scope by store if available
    const hasStore = req.user && req.user.store_id
    let p
    if (hasStore) {
      p = await db.query('SELECT id, created_at, total_amount, metadata FROM purchases WHERE id=$1 AND store_id=$2', [id, req.user.store_id])
    } else {
      p = await db.query('SELECT id, created_at, total_amount, metadata FROM purchases WHERE id=$1', [id])
    }
    if (p.rows.length === 0) return res.status(404).json({ error: 'not found' })
    const items = await db.query('SELECT id, product_id, sku, name, qty, price, line_total FROM purchase_items WHERE purchase_id=$1', [id])
    res.json({ purchase: p.rows[0], items: items.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/purchases - create purchase (simple)
router.post('/', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(201).json({})
  const { supplier_id, total_amount, metadata, items } = req.body || {}
  // validate items early
  if (items && !Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' })
  if (items && items.length > 1000) return res.status(400).json({ error: 'too many items' })
  if (items) {
    for (const [i, it] of items.entries()) {
      if (typeof it !== 'object' || it === null) return res.status(400).json({ error: `item[${i}] must be an object` })
      if ('qty' in it && !v.isNonNegativeNumber(it.qty)) return res.status(400).json({ error: `item[${i}].qty must be a non-negative number` })
      if ('price' in it && !v.isNonNegativeNumber(it.price)) return res.status(400).json({ error: `item[${i}].price must be a non-negative number` })
    }
  }

  try {
    const result = await tx.runTransaction(async (client) => {
      const storeId = req.user && req.user.store_id ? req.user.store_id : null
      const insert = await client.query(
        'INSERT INTO purchases (supplier_id, total_amount, metadata, store_id) VALUES ($1, $2, $3, $4) RETURNING id, created_at, supplier_id, total_amount, metadata, store_id',
        [supplier_id || null, Number(total_amount) || 0, metadata || null, storeId]
      )
      const created = insert.rows[0]

      // Insert items within same transaction
      if (Array.isArray(items) && items.length > 0) {
        const vals = []
        const params = []
        // Use schema cache to detect whether purchase_items has a store_id column
        const hasStoreCol = schemaCache.hasColumn('purchase_items', 'store_id')
        let idx = 1
        for (const it of items) {
          if (hasStoreCol) {
            params.push(created.id, it.product_id || null, it.sku || null, it.name || null, Number(it.qty) || 0, Number(it.price) || 0, Number(it.line_total) || 0, storeId)
            vals.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7})`)
            idx += 8
          } else {
            params.push(created.id, it.product_id || null, it.sku || null, it.name || null, Number(it.qty) || 0, Number(it.price) || 0, Number(it.line_total) || 0)
            vals.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6})`)
            idx += 7
          }
        }
        const sql = hasStoreCol
          ? `INSERT INTO purchase_items (purchase_id, product_id, sku, name, qty, price, line_total, store_id) VALUES ${vals.join(',')}`
          : `INSERT INTO purchase_items (purchase_id, product_id, sku, name, qty, price, line_total) VALUES ${vals.join(',')}`
        try {
          await client.query(sql, params)
        } catch (e) {
          console.error('Bulk insert purchase_items failed. SQL:', sql)
          console.error('Params:', params)
          throw e
        }
      }
      return { status: 201, json: created }
    }, { route: 'purchases.create' })

    if (result && result.status) {
      return res.status(result.status).json(result.json)
    }
    res.status(500).json({ error: 'internal error' })
  } catch (err) {
    console.error('Failed to create purchase', err)
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router
