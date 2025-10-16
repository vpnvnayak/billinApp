const express = require('express');
const router = express.Router();
const db = require('../db');
const v = require('../validators')
// optionalAuth middleware will populate req.user when a valid Bearer token is present

// GET /api/products - list products (with optional server-side pagination)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.max(1, parseInt(req.query.limit) || 10)
  const q = (req.query.q || '').trim()
  if (!v.isValidQueryLength(q)) return res.status(400).json({ error: 'query too long' })
    const filter = (req.query.filter || '').trim()
    const lowStockThreshold = Number(process.env.LOW_STOCK_THRESHOLD || 5)

    // Example fallback
    const fallback = [
      { id: 1, sku: '0001', name: 'Milk 1L', price: 1.5, mrp: null, unit: 'L', tax_percent: 0, stock: 0 },
      { id: 2, sku: '0002', name: 'Bread', price: 1.0, mrp: null, unit: 'Nos', tax_percent: 0, stock: 0 },
    ];
    if (!process.env.DATABASE_URL) {
      const start = (page - 1) * limit
      return res.json({ data: fallback.slice(start, start + limit), total: fallback.length })
    }

    const params = []
    let where = ''
    // filter=low_stock will return products with stock <= threshold
    // Add store scoping when user has a store_id (multi-tenant)
    // The products route is public, so req.user may not be populated by requireAuth.
  // Best-effort: req.user may be populated by optionalAuth middleware if a valid Bearer token was provided.
  const storeId = req.user && req.user.store_id ? req.user.store_id : null
    if (filter === 'low_stock') {
      where = `WHERE stock <= $1`
      params.push(lowStockThreshold)
    } else if (q) {
  params.push(`%${q}%`)
  where = `WHERE sku ILIKE $1 OR name ILIKE $1`
    }
    if (storeId) {
      if (where) where += ' AND store_id = $' + (params.length + 1)
      else where = 'WHERE store_id = $' + (params.length + 1)
      params.push(storeId)
    }
    const offset = (page - 1) * limit
  const sql = `SELECT id, sku, name, price, mrp, unit, tax_percent, stock, COUNT(*) OVER() AS total_count FROM products ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)
    const result = await db.query(sql, params)
    const total = result.rows.length ? Number(result.rows[0].total_count || 0) : 0
    const rows = result.rows.map(r => { const { total_count, ...rest } = r; return rest })
    res.json({ data: rows, total })
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/top - top products by revenue (from sales)
router.get('/top', async (req, res) => {
  try {
    const limit = Math.max(1, Number(req.query.limit) || 5)
    if (!process.env.DATABASE_URL) return res.json({ data: [] })

    // revenue computed from sale_items.line_total (or qty*price)
    const topParams = [limit]
    let topSql = `
      SELECT COALESCE(si.product_id,0) AS product_id, si.sku, si.name,
        SUM(si.qty) AS total_qty,
        COALESCE(SUM(si.line_total), SUM(si.qty * si.price)) AS revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
    `
    if (req.user && req.user.store_id) {
      topParams.push(req.user.store_id)
      topSql += ` WHERE s.store_id = $${topParams.length}`
    }
    topSql += `\n      GROUP BY COALESCE(si.product_id,0), si.sku, si.name\n      ORDER BY revenue DESC\n      LIMIT $1\n    `
    const result = await db.query(topSql, topParams)
    res.json({ data: result.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
  if (!process.env.DATABASE_URL) return res.json({ id, sku: '0000', name: 'Sample', price: 0, mrp: null, unit: null, tax_percent: 0, stock: 0 });

  // scope by store if present
  const storeId = req.user && req.user.store_id ? req.user.store_id : null
  const result = storeId
    ? await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE id = $1 AND store_id = $2', [id, storeId])
    : await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products - create a product (simple)
router.post('/', async (req, res) => {
  try {
  const { name, sku, price, mrp, unit, stock, tax_percent } = req.body || {}
    // Basic validation
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' })
    if (price !== undefined && (Number.isNaN(Number(price)) || Number(price) < 0)) return res.status(400).json({ error: 'price must be a non-negative number' })
    if (mrp !== undefined && mrp !== null && (Number.isNaN(Number(mrp)) || Number(mrp) < 0)) return res.status(400).json({ error: 'mrp must be a non-negative number or null' })
    if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) return res.status(400).json({ error: 'stock must be a non-negative integer' })
    if (tax_percent !== undefined && (Number.isNaN(Number(tax_percent)) || Number(tax_percent) < 0)) return res.status(400).json({ error: 'tax_percent must be a non-negative number' })

    if (!process.env.DATABASE_URL) {
      // return created object with fake id
      return res.status(201).json({ id: Date.now(), sku: sku || '', name, price: price || 0, mrp: mrp || null, unit: unit || null, tax_percent: 0, stock: 0 })
    }

  const storeIdForInsert = req.user && req.user.store_id ? req.user.store_id : null
    const stockVal = Number(stock) || 0
    const taxVal = Number(tax_percent) || 0
    const result = await db.query(
      'INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, sku, name, price, mrp, unit, tax_percent, stock',
      [sku || null, name, price || 0, mrp || null, unit || null, taxVal, stockVal, storeIdForInsert]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/products/:id - update a product
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name, sku, price, mrp, unit, tax_percent, stock } = req.body || {}
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' })
  if (price !== undefined && (Number.isNaN(Number(price)) || Number(price) < 0)) return res.status(400).json({ error: 'price must be a non-negative number' })
  if (mrp !== undefined && mrp !== null && (Number.isNaN(Number(mrp)) || Number(mrp) < 0)) return res.status(400).json({ error: 'mrp must be a non-negative number or null' })
  if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) return res.status(400).json({ error: 'stock must be a non-negative integer' })
  // id should be integer-like
  if (!Number.isInteger(Number(id))) return res.status(400).json({ error: 'invalid id' })
  try {
    if (!process.env.DATABASE_URL) {
      return res.json({ id, sku: sku || '', name, price: price || 0, mrp: mrp || null, unit: unit || null, tax_percent: tax_percent || 0, stock: stock || 0 })
    }

    const result = await db.query(
      // only update if product belongs to store when scoped
      req.user && req.user.store_id
        ? 'UPDATE products SET sku=$1, name=$2, price=$3, mrp=$4, unit=$5, tax_percent=$6, stock=$7 WHERE id=$8 AND store_id=$9 RETURNING id, sku, name, price, mrp, unit, tax_percent, stock'
        : 'UPDATE products SET sku=$1, name=$2, price=$3, mrp=$4, unit=$5, tax_percent=$6, stock=$7 WHERE id=$8 RETURNING id, sku, name, price, mrp, unit, tax_percent, stock',
      req.user && req.user.store_id
        ? [sku || null, name, price || 0, mrp || null, unit || null, tax_percent || 0, stock || 0, id, req.user.store_id]
        : [sku || null, name, price || 0, mrp || null, unit || null, tax_percent || 0, stock || 0, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router;

