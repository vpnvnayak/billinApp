const express = require('express')
const router = express.Router()
const db = require('../db')
const v = require('../validators')
const schemaCache = require('../schemaCache')

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

    const storeId = req.user && req.user.store_id ? req.user.store_id : null

    // Special barcode handling: if barcode starts with '#' then treat as PLU-like encoded value
    // Format: #[6-digit store_seq padded][5-digit qty]
    // Example: #00187200530 -> store_seq 001872 -> 1872, qty 00530 -> 0.530 (qty = last5 / 1000)
    if (q && q.startsWith('#')) {
      const code = q.slice(1)
      // need at least 11 chars: 6 for store_seq and 5 for qty
      if (code.length < 11) return res.status(400).json({ error: 'invalid barcode format' })
      const storeSeqPart = code.slice(0, 6)
      const qtyPart = code.slice(6, 11)
      const storeSeq = parseInt(storeSeqPart, 10)
      const qty = Number.parseInt(qtyPart, 10) / 1000
      if (Number.isNaN(storeSeq) || Number.isNaN(qty)) return res.status(400).json({ error: 'invalid barcode format' })

      // Only search products marked is_repacking = true
      const hasStoreSeq = schemaCache.hasColumn('products', 'store_seq')
      const hasIsRepacking = schemaCache.hasColumn('products', 'is_repacking')
      if (!hasIsRepacking) return res.json([])

      let prod
      try {
        if (hasStoreSeq) {
          if (storeId) {
            prod = await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock, store_seq FROM products WHERE store_seq = $1 AND is_repacking = true AND store_id = $2 LIMIT 1', [storeSeq, storeId])
          } else {
            prod = await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock, store_seq FROM products WHERE store_seq = $1 AND is_repacking = true LIMIT 1', [storeSeq])
          }
        } else {
          // fallback: cannot search by store_seq; return empty
          return res.json([])
        }
      } catch (e) {
        console.error('pos barcode search error', e)
        return res.status(500).json({ error: 'Internal server error' })
      }

      if (!prod || !prod.rows || prod.rows.length === 0) return res.json([])
      const row = prod.rows[0]
      // attach parsed quantity so POS can use it
      row.scale_qty = qty
      return res.json([row])
    }

    // If product_variants table exists, prefer returning variants (joined with product metadata)
    const hasVariants = schemaCache.hasColumn('product_variants', 'id')

    if (!q) {
      if (hasVariants) {
        const sql = storeId
          ? `SELECT pv.id AS variant_id, p.id AS product_id, p.sku, p.name, COALESCE(pv.price, p.price) AS price, pv.mrp, COALESCE(pv.unit, p.unit) AS unit, COALESCE(pv.tax_percent, p.tax_percent) AS tax_percent, pv.stock FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE p.store_id = $1 ORDER BY p.sku LIMIT $2`
          : `SELECT pv.id AS variant_id, p.id AS product_id, p.sku, p.name, COALESCE(pv.price, p.price) AS price, pv.mrp, COALESCE(pv.unit, p.unit) AS unit, COALESCE(pv.tax_percent, p.tax_percent) AS tax_percent, pv.stock FROM product_variants pv JOIN products p ON pv.product_id = p.id ORDER BY p.sku LIMIT $1`
        const params = storeId ? [storeId, limit] : [limit]
  const r = await db.query(sql, params)
        // normalize to same shape as previous API (id was product id) — keep id as product id but include mrp
  const rows = r.rows.map(rr => ({ id: rr.product_id, variant_id: rr.variant_id, sku: rr.sku, name: rr.name, price: rr.price, mrp: rr.mrp, unit: rr.unit, tax_percent: rr.tax_percent, stock: rr.stock }))
  if (process.env.NODE_ENV !== 'production') res.setHeader('X-Pos-Rows', String(rows.slice(0, limit).length))
  return res.json(rows.slice(0, limit))
      }

      const r = storeId
        ? await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE store_id = $1 LIMIT $2', [storeId, limit])
        : await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products LIMIT $1', [limit])
      
  return res.json(r.rows)
    }

    // use ILIKE for case-insensitive partial match
    // escape % and _ to avoid unintended wildcard matches
    const term = `%${v.escapeLike(q)}%`

    if (hasVariants) {
      const sql = storeId
        ? `SELECT pv.id AS variant_id, p.id AS product_id, p.sku, p.name, COALESCE(pv.price, p.price) AS price, pv.mrp, COALESCE(pv.unit, p.unit) AS unit, COALESCE(pv.tax_percent, p.tax_percent) AS tax_percent, pv.stock FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE (p.sku ILIKE $1 OR p.name ILIKE $1 OR COALESCE(pv.barcode,'') ILIKE $1) AND p.store_id = $2 LIMIT $3`
        : `SELECT pv.id AS variant_id, p.id AS product_id, p.sku, p.name, COALESCE(pv.price, p.price) AS price, pv.mrp, COALESCE(pv.unit, p.unit) AS unit, COALESCE(pv.tax_percent, p.tax_percent) AS tax_percent, pv.stock FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE (p.sku ILIKE $1 OR p.name ILIKE $1 OR COALESCE(pv.barcode,'') ILIKE $1) LIMIT $2`
      const params = storeId ? [term, storeId, limit] : [term, limit]
      const r = await db.query(sql, params)
  const rows = r.rows.map(rr => ({ id: rr.product_id, variant_id: rr.variant_id, sku: rr.sku, name: rr.name, price: rr.price, mrp: rr.mrp, unit: rr.unit, tax_percent: rr.tax_percent, stock: rr.stock }))
  // If variants search returned nothing, fallback to searching products directly
      if (rows.length === 0) {
        const prodSql = storeId
          ? `SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE (sku ILIKE $1 OR name ILIKE $1) AND store_id = $2 LIMIT $3`
          : `SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE sku ILIKE $1 OR name ILIKE $1 LIMIT $2`
    const prodParams = storeId ? [term, storeId, limit] : [term, limit]
  const prodResp = await db.query(prodSql, prodParams)
  return res.json(prodResp.rows)
      }
      return res.json(rows)
    }

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
