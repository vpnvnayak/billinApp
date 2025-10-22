const express = require('express')
const router = express.Router()
const db = require('../db')
const v = require('../validators')
const schemaCache = require('../schemaCache')

// GET /api/pos/products?query=&limit=
router.get('/products', async (req, res) => {
  try {
  const q = (req.query.query || '').trim()
  const storeSeqParam = req.query.store_seq ? String(req.query.store_seq).trim() : null
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

    // feature flags from schema cache
    const hasVariants = schemaCache.hasColumn('product_variants', 'id')
    const hasIsRepacking = schemaCache.hasColumn('products', 'is_repacking')

    // If store_seq provided, prefer exact lookup by per-store sequence id
    if (storeSeqParam) {
      // helper to handle query and retry when is_repacking column unexpectedly missing
      const runQueryWithOptionalIsRepacking = async (sqlBase, params, includeIsRep) => {
        try {
          return await db.query(sqlBase, params)
        } catch (err) {
          // If column missing, refresh schema cache and retry without the is_repacking filter
          if (err && err.code === '42703') {
            await schemaCache.init()
            const retrySql = includeIsRep ? sqlBase.replace(/\s+AND\s+p\.is_repacking\s*=\s*true/gi, '') : sqlBase
            return await db.query(retrySql, params)
          }
          throw err
        }
      }

      if (hasVariants) {
        let sql, params
        if (storeId) {
          sql = `SELECT pv.id AS variant_id, p.id AS product_id, p.sku, p.name, p.store_seq, COALESCE(pv.price, p.price) AS price, pv.mrp, COALESCE(pv.unit, p.unit) AS unit, COALESCE(pv.tax_percent, p.tax_percent) AS tax_percent, pv.stock FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE p.store_id = $1 AND p.store_seq::text = $2 ${hasIsRepacking ? 'AND p.is_repacking = true' : ''} LIMIT $3`
          params = [storeId, storeSeqParam, limit]
        } else {
          sql = `SELECT pv.id AS variant_id, p.id AS product_id, p.sku, p.name, p.store_seq, COALESCE(pv.price, p.price) AS price, pv.mrp, COALESCE(pv.unit, p.unit) AS unit, COALESCE(pv.tax_percent, p.tax_percent) AS tax_percent, pv.stock FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE p.store_seq::text = $1 ${hasIsRepacking ? 'AND p.is_repacking = true' : ''} LIMIT $2`
          params = [storeSeqParam, limit]
        }
        const r = await runQueryWithOptionalIsRepacking(sql, params, hasIsRepacking)
        if (r.rows && r.rows.length > 0) {
          const rows = r.rows.map(rr => ({ id: rr.product_id, variant_id: rr.variant_id, sku: rr.sku, name: rr.name, price: rr.price, mrp: rr.mrp, unit: rr.unit, tax_percent: rr.tax_percent, stock: rr.stock }))
          return res.json(rows)
        }
        // otherwise fall through to try direct product lookup (product may exist without variants)
      }

      // no variants table — search products directly
      try {
        let sql = storeId
          ? `SELECT id, sku, name, store_seq, price, mrp, unit, tax_percent, stock FROM products WHERE store_id = $1 AND store_seq::text = $2 ${hasIsRepacking ? 'AND is_repacking = true' : ''} LIMIT $3`
          : `SELECT id, sku, name, store_seq, price, mrp, unit, tax_percent, stock FROM products WHERE store_seq::text = $1 ${hasIsRepacking ? 'AND is_repacking = true' : ''} LIMIT $2`
        const params = storeId ? [storeId, storeSeqParam, limit] : [storeSeqParam, limit]
        const r = await db.query(sql, params)
        return res.json(r.rows.map(rr => ({ ...rr })))
      } catch (err) {
        if (err && err.code === '42703') {
          // refresh schema cache and retry without is_repacking condition
          await schemaCache.init()
          const sql = storeId
            ? `SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE store_id = $1 AND store_seq::text = $2 LIMIT $3`
            : `SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE store_seq::text = $1 LIMIT $2`
          const params = storeId ? [storeId, storeSeqParam, limit] : [storeSeqParam, limit]
          const r2 = await db.query(sql, params)
          return res.json(r2.rows.map(rr => ({ ...rr })))
        }
        throw err
      }
    }

  // If product_variants table exists, prefer returning variants (joined with product metadata)

    if (!q) {
      if (hasVariants) {
        const sql = storeId
          ? `SELECT pv.id AS variant_id, p.id AS product_id, p.sku, p.name, COALESCE(pv.price, p.price) AS price, pv.mrp, COALESCE(pv.unit, p.unit) AS unit, COALESCE(pv.tax_percent, p.tax_percent) AS tax_percent, pv.stock FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE p.store_id = $1 ORDER BY p.sku LIMIT $2`
          : `SELECT pv.id AS variant_id, p.id AS product_id, p.sku, p.name, COALESCE(pv.price, p.price) AS price, pv.mrp, COALESCE(pv.unit, p.unit) AS unit, COALESCE(pv.tax_percent, p.tax_percent) AS tax_percent, pv.stock FROM product_variants pv JOIN products p ON pv.product_id = p.id ORDER BY p.sku LIMIT $1`
        const params = storeId ? [storeId, limit] : [limit]
        const r = await db.query(sql, params)
        // normalize to same shape as previous API (id was product id) — keep id as product id but include mrp
  const rows = r.rows.map(rr => ({ id: rr.product_id, variant_id: rr.variant_id, sku: rr.sku, name: rr.name, store_seq: rr.store_seq, price: rr.price, mrp: rr.mrp, unit: rr.unit, tax_percent: rr.tax_percent, stock: rr.stock }))
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
