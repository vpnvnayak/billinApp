const express = require('express')
const router = express.Router()
const db = require('../db')
const schemaCache = require('../schemaCache')

// GET /api/reports/stock
router.get('/stock', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Number(req.query.limit) || 10)
    const q = (req.query.q || '').trim()
    const filter = (req.query.filter || '').trim()
    const lowStockThreshold = Number(process.env.LOW_STOCK_THRESHOLD || 5)

    // sample fallback when no DB configured
    const SAMPLE = {
      total: 27858,
      kpis: { low_stock: 47, out_of_stock: 7781, expired_batches: 6824 },
      data: []
    }
    if (!process.env.DATABASE_URL) {
      const start = (page - 1) * limit
      return res.json({ kpis: SAMPLE.kpis, total: SAMPLE.total, data: SAMPLE.data.slice(start, start + limit) })
    }

    const params = []
    let where = ''
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    const hasVariants = schemaCache.hasColumn('product_variants', 'id')
    if (q) {
      params.push(`%${q}%`)
      if (hasVariants) {
        where = `WHERE p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR COALESCE(pv.barcode,'') ILIKE $${params.length}`
      } else {
        where = `WHERE p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length}`
      }
    }
    if (filter === 'low_stock') {
      if (where) {
        if (hasVariants) where += ` AND COALESCE(pv.stock, p.stock) <= ${lowStockThreshold}`
        else where += ` AND p.stock <= ${lowStockThreshold}`
      } else {
        if (hasVariants) where = `WHERE COALESCE(pv.stock, p.stock) <= ${lowStockThreshold}`
        else where = `WHERE p.stock <= ${lowStockThreshold}`
      }
    }
    if (storeId) {
      if (where) where += ` AND p.store_id = $${params.length + 1}`
      else where = `WHERE p.store_id = $${params.length + 1}`
      params.push(storeId)
    }

    // Always exclude products that are not assigned to any store (store_id IS NULL)
    if (where) where += ` AND p.store_id IS NOT NULL`
    else where = `WHERE p.store_id IS NOT NULL`

    const offset = (page - 1) * limit

    // Select products or variants and compute a best-effort purchased_price from latest purchase_items.price when available
    // Also compute stock_value = stock * purchased_price
    const includeHsn = schemaCache.hasColumn('products', 'hsn')
    const includeTax = schemaCache.hasColumn('products', 'tax_percent')

    // derive purchased price and qty for products and variants
    const purchasedPriceExprProduct = `COALESCE((SELECT pi.price FROM purchase_items pi WHERE pi.product_id = p.id ORDER BY pi.id DESC LIMIT 1), p.price)`
    const purchasedQtyExprProduct = `(SELECT COALESCE(SUM(pi.qty),0) FROM purchase_items pi WHERE pi.product_id = p.id)`
    const purchasedPriceExprVariant = `COALESCE((SELECT pi.price FROM purchase_items pi WHERE pi.variant_id = pv.id ORDER BY pi.id DESC LIMIT 1), COALESCE(pv.price, p.price))`
    const purchasedQtyExprVariant = `(SELECT COALESCE(SUM(pi.qty),0) FROM purchase_items pi WHERE pi.variant_id = pv.id)`
    const stockValueExprProduct = `(${purchasedPriceExprProduct} * COALESCE(p.stock,0))::numeric`
    const stockValueExprVariant = `(${purchasedPriceExprVariant} * COALESCE(pv.stock,0))::numeric`

    let select
    if (hasVariants) {
      const cols = [
        'pv.id AS id',
        'p.name',
        "p.sku AS code",
        includeHsn ? "COALESCE(p.hsn, '') AS hsn" : "'' AS hsn",
        'pv.mrp',
        `${purchasedPriceExprVariant} AS purchased_price`,
        'COALESCE(pv.price, p.price) AS selling_price',
        includeTax ? "COALESCE(COALESCE(pv.tax_percent, p.tax_percent)::text || '%', '') AS tax" : "'' AS tax",
        `${purchasedQtyExprVariant} AS purchased_qty`,
        'COALESCE(pv.stock, 0) AS stock',
        'COALESCE(pv.unit, p.unit) AS unit',
        `${stockValueExprVariant} AS stock_value`,
        'COUNT(*) OVER() AS total_count'
      ]
      select = `SELECT ${cols.join(',\n        ')} FROM product_variants pv JOIN products p ON pv.product_id = p.id ${where} ORDER BY p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    } else {
      const cols = [
        'p.id',
        'p.name',
        'p.sku AS code',
        includeHsn ? "COALESCE(p.hsn, '') AS hsn" : "'' AS hsn",
        'p.mrp',
        `${purchasedPriceExprProduct} AS purchased_price`,
        'COALESCE(p.price, 0) AS selling_price',
        includeTax ? "COALESCE(p.tax_percent::text || '%', '') AS tax" : "'' AS tax",
        `${purchasedQtyExprProduct} AS purchased_qty`,
        'COALESCE(p.stock, 0) AS stock',
        'p.unit',
        `${stockValueExprProduct} AS stock_value`,
        'COUNT(*) OVER() AS total_count'
      ]
      select = `SELECT ${cols.join(',\n        ')} FROM products p ${where} ORDER BY p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    }

    params.push(limit, offset)
    const result = await db.query(select, params)
    const total = result.rows.length ? Number(result.rows[0].total_count || 0) : 0
    const rows = result.rows.map(r => {
      const { total_count, ...rest } = r
      // normalize names to match frontend expectations
      return {
        id: rest.id,
        name: rest.name,
        code: rest.code,
        hsn: rest.hsn,
        mrp: rest.mrp,
        purchased_price: Number(rest.purchased_price),
        selling_price: Number(rest.selling_price),
        tax: rest.tax,
        purchased_qty: Number(rest.purchased_qty || 0),
        stock: Number(rest.stock || 0),
        unit: rest.unit,
        stock_value: Number(rest.stock_value || 0)
      }
    })

    // KPIs: compute counts (low stock, out_of_stock).
    // If product_variants exist, compute KPIs from variant-level stock joined with products so counts match variant-based inventory.
    let lowCount = 0
    let outCount = 0
    if (hasVariants) {
      const kpiParams = []
      let kpiWhere = ''
      if (storeId) {
        kpiParams.push(storeId)
        kpiWhere = ` WHERE p.store_id = $1`
      } else {
        kpiWhere = ` WHERE p.store_id IS NOT NULL`
      }
      const lowQ = await db.query(`SELECT COUNT(*) AS c FROM product_variants pv JOIN products p ON pv.product_id = p.id ${kpiWhere} AND COALESCE(pv.stock,0) <= $${kpiParams.length + 1}`, [...kpiParams, lowStockThreshold])
      const outQ = await db.query(`SELECT COUNT(*) AS c FROM product_variants pv JOIN products p ON pv.product_id = p.id ${kpiWhere} AND COALESCE(pv.stock,0) <= 0`, [...kpiParams])
      lowCount = Number(lowQ.rows[0].c || 0)
      outCount = Number(outQ.rows[0].c || 0)
    } else {
      const kpiParams = []
      let kpiWhere = ''
      if (storeId) { kpiParams.push(storeId); kpiWhere = ` WHERE store_id = $1` }
      else kpiWhere = ` WHERE store_id IS NOT NULL`
      const lowQ = await db.query(`SELECT COUNT(*) AS c FROM products ${kpiWhere} AND COALESCE(stock,0) <= $${kpiParams.length + 1}`, [...kpiParams, lowStockThreshold])
      const outQ = await db.query(`SELECT COUNT(*) AS c FROM products ${kpiWhere} AND COALESCE(stock,0) <= 0`, [...kpiParams])
      lowCount = Number(lowQ.rows[0].c || 0)
      outCount = Number(outQ.rows[0].c || 0)
    }

    res.json({ kpis: { low_stock: lowCount, out_of_stock: outCount, expired_batches: 0 }, total, data: rows })
  } catch (err) {
    console.error('reports.stock error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
