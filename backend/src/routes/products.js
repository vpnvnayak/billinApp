const express = require('express');
const router = express.Router();
const db = require('../db');
const v = require('../validators')
const schemaCache = require('../schemaCache')
// optionalAuth middleware will populate req.user when a valid Bearer token is present

// GET /api/products - list products (with optional server-side pagination)
router.get('/', async (req, res) => {
  try {
    const includeIsRepacking = schemaCache.hasColumn('products', 'is_repacking')
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
  const includeStoreSeq = schemaCache.hasColumn('products', 'store_seq')
  const selectColsBase = includeIsRepacking ? 'id, sku, name, price, mrp, unit, tax_percent, stock, is_repacking' : 'id, sku, name, price, mrp, unit, tax_percent, stock'
  const selectCols = includeStoreSeq ? `${selectColsBase}, store_seq, COUNT(*) OVER() AS total_count` : `${selectColsBase}, COUNT(*) OVER() AS total_count`
  const sql = `SELECT ${selectCols} FROM products ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)
    let result
    try {
      result = await db.query(sql, params)
    } catch (err) {
      // If the DB doesn't have the is_repacking column (e.g., migrations not applied), retry without it.
      if (err && err.code === '42703' && /is_repacking/.test(err.message || '')) {
        const selectColsNo = 'id, sku, name, price, mrp, unit, tax_percent, stock, COUNT(*) OVER() AS total_count'
        // params already includes limit and offset at this point; compute their placeholder positions
        const sqlNo = `SELECT ${selectColsNo} FROM products ${where} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
        result = await db.query(sqlNo, params)
      } else throw err
    }
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
  const includeIsRepackingForGet = schemaCache.hasColumn('products', 'is_repacking')
  const includeStoreSeqForGet = schemaCache.hasColumn('products', 'store_seq')
  const colsForGetBase = includeIsRepackingForGet ? 'id, sku, name, price, mrp, unit, tax_percent, stock, is_repacking' : 'id, sku, name, price, mrp, unit, tax_percent, stock'
  const colsForGet = includeStoreSeqForGet ? `${colsForGetBase}, store_seq` : colsForGetBase
  let result
  try {
    result = storeId
      ? await db.query(`SELECT ${colsForGet} FROM products WHERE id = $1 AND store_id = $2`, [id, storeId])
      : await db.query(`SELECT ${colsForGet} FROM products WHERE id = $1`, [id]);
  } catch (err) {
    if (err && err.code === '42703' && /is_repacking/.test(err.message || '')) {
      const colsNo = 'id, sku, name, price, mrp, unit, tax_percent, stock'
      result = storeId
        ? await db.query(`SELECT ${colsNo} FROM products WHERE id = $1 AND store_id = $2`, [id, storeId])
        : await db.query(`SELECT ${colsNo} FROM products WHERE id = $1`, [id])
    } else throw err
  }
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
  const { name, sku: skuIn, price, mrp, unit, stock, tax_percent, is_repacking } = req.body || {}
    // Basic validation
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' })
    if (price !== undefined && (Number.isNaN(Number(price)) || Number(price) < 0)) return res.status(400).json({ error: 'price must be a non-negative number' })
    if (mrp !== undefined && mrp !== null && (Number.isNaN(Number(mrp)) || Number(mrp) < 0)) return res.status(400).json({ error: 'mrp must be a non-negative number or null' })
    if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) return res.status(400).json({ error: 'stock must be a non-negative integer' })
    if (tax_percent !== undefined && (Number.isNaN(Number(tax_percent)) || Number(tax_percent) < 0)) return res.status(400).json({ error: 'tax_percent must be a non-negative number' })

    if (!process.env.DATABASE_URL) {
      // return created object with fake id
      return res.status(201).json({ id: Date.now(), sku: sku || '', name, price: price || 0, mrp: mrp || null, unit: unit || null, tax_percent: 0, stock: 0, is_repacking: !!is_repacking })
    }

  const storeIdForInsert = req.user && req.user.store_id ? req.user.store_id : null
    const stockVal = Number(stock) || 0
    const taxVal = Number(tax_percent) || 0
    // Ensure SKU+MRP pair is unique within the store (or globally when not scoped). Use case-insensitive SKU match
    // and exact MRP match (including NULL) — i.e., don't allow creating another product with same SKU and same MRP.
    // If no SKU/barcode provided, generate one using store name prefix + 5-digit random number
    let sku = skuIn
    if (!sku || !sku.toString().trim()) {
      // generate 8-char barcode: first 2 letters from store name, then 6 random digits
      let prefix = 'ST'
      try {
        let storeName = null
        if (storeIdForInsert) {
          const sres = await db.query('SELECT name FROM stores WHERE id = $1 LIMIT 1', [storeIdForInsert])
          if (sres && sres.rows && sres.rows.length > 0) storeName = sres.rows[0].name
        } else if (process.env.STORE_NAME) {
          storeName = process.env.STORE_NAME
        }
        if (storeName) {
          // keep only letters, pick first two chars
          const letters = (storeName || '').toString().replace(/[^A-Za-z]/g, '')
          if (letters.length >= 2) prefix = letters.slice(0,2).toUpperCase()
          else if (letters.length === 1) prefix = (letters[0] + 'X').toUpperCase()
        }
      } catch (e) {
        // ignore and use default prefix
      }

      const maxAttempts = 50
      let attempt = 0
      let candidate = null
      while (attempt < maxAttempts) {
        const rand = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
        candidate = `${prefix}${rand}`
        // check uniqueness (case-insensitive), scoped to store when applicable
        let dupCheck
        if (storeIdForInsert) dupCheck = await db.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND store_id = $2', [candidate, storeIdForInsert])
        else dupCheck = await db.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1)', [candidate])
        if (dupCheck.rows.length === 0) break
        attempt++
      }
      if (!candidate) candidate = `${prefix}${Date.now().toString().slice(-6)}`
      sku = candidate
    }

    if (sku && sku.toString().trim()) {
      const skuVal = sku.toString().trim()
      const mrpVal = mrp !== undefined ? mrp : null
      let dup
      if (storeIdForInsert) {
        dup = await db.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND mrp IS NOT DISTINCT FROM $2 AND store_id = $3', [skuVal, mrpVal, storeIdForInsert])
      } else {
        dup = await db.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND mrp IS NOT DISTINCT FROM $2', [skuVal, mrpVal])
      }
      if (dup.rows.length > 0) return res.status(400).json({ error: 'SKU/barcode with same MRP already exists' })
    }
  const isRepackingVal = !!is_repacking
  const includeStoreSeq = schemaCache.hasColumn('products', 'store_seq')
    let result
    if (schemaCache.hasColumn('products', 'is_repacking')) {
      try {
        const returning = includeStoreSeq ? 'id, sku, name, price, mrp, unit, tax_percent, stock, is_repacking, store_seq' : 'id, sku, name, price, mrp, unit, tax_percent, stock, is_repacking'
        result = await db.query(
          `INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, is_repacking, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${returning}`,
          [sku || null, name, price || 0, mrp || null, unit || null, taxVal, stockVal, isRepackingVal, storeIdForInsert]
        )
      } catch (err) {
        if (err && err.code === '42703' && /is_repacking/.test(err.message || '')) {
          // fallback to insert without is_repacking column
          result = await db.query(
            'INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, sku, name, price, mrp, unit, tax_percent, stock',
            [sku || null, name, price || 0, mrp || null, unit || null, taxVal, stockVal, storeIdForInsert]
          )
        } else throw err
      }
    } else {
      const returningNoRepack = includeStoreSeq ? 'id, sku, name, price, mrp, unit, tax_percent, stock, store_seq' : 'id, sku, name, price, mrp, unit, tax_percent, stock'
      result = await db.query(
        `INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${returningNoRepack}`,
        [sku || null, name, price || 0, mrp || null, unit || null, taxVal, stockVal, storeIdForInsert]
      )
    }
    // If schema cache was not initialized at the time of building the RETURNING clause,
    // the INSERT may have omitted store_seq even though the DB has the column and trigger.
    // In that case, fetch the freshly inserted row's store_seq explicitly.
    const created = result.rows[0]
    try {
      if (created && created.store_seq === undefined) {
        const r2 = await db.query('SELECT store_seq FROM products WHERE id = $1', [created.id])
        if (r2 && r2.rows && r2.rows.length > 0) created.store_seq = r2.rows[0].store_seq
      }
      // ensure is_repacking is returned when the DB has the column but RETURNING omitted it
      if (created && created.is_repacking === undefined && schemaCache.hasColumn('products', 'is_repacking')) {
        try {
          const r3 = await db.query('SELECT is_repacking FROM products WHERE id = $1', [created.id])
          if (r3 && r3.rows && r3.rows.length > 0) created.is_repacking = r3.rows[0].is_repacking
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore any error fetching store_seq and return what we have
    }
    res.status(201).json(created)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/products/:id/variants - return product_variants for a product if available
router.get('/:id/variants', async (req, res) => {
  const { id } = req.params
  if (!Number.isInteger(Number(id))) return res.status(400).json({ error: 'invalid id' })
  try {
    if (!process.env.DATABASE_URL) return res.json([])
    const hasVariants = schemaCache.hasColumn('product_variants', 'id')
    if (!hasVariants) return res.json([])
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    // Ensure product belongs to store when scoped
    if (storeId) {
      const p = await db.query('SELECT id FROM products WHERE id = $1 AND store_id = $2', [id, storeId])
      if (p.rows.length === 0) return res.status(404).json({ error: 'not found' })
    }
    const q = await db.query('SELECT id, product_id, mrp, price, unit, tax_percent, stock, barcode FROM product_variants WHERE product_id = $1 ORDER BY mrp NULLS FIRST', [id])
    res.json(q.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/products/:id - update a product
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name, sku, price, mrp, unit, tax_percent, stock, is_repacking } = req.body || {}
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' })
  if (price !== undefined && (Number.isNaN(Number(price)) || Number(price) < 0)) return res.status(400).json({ error: 'price must be a non-negative number' })
  if (mrp !== undefined && mrp !== null && (Number.isNaN(Number(mrp)) || Number(mrp) < 0)) return res.status(400).json({ error: 'mrp must be a non-negative number or null' })
  if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) return res.status(400).json({ error: 'stock must be a non-negative integer' })
  // id should be integer-like
  if (!Number.isInteger(Number(id))) return res.status(400).json({ error: 'invalid id' })
  try {
    if (!process.env.DATABASE_URL) {
        return res.json({ id, sku: sku || '', name, price: price || 0, mrp: mrp || null, unit: unit || null, tax_percent: tax_percent || 0, stock: stock || 0, is_repacking: !!is_repacking })
      }

    // Ensure SKU+MRP uniqueness on update: check other products with same SKU and MRP (case-insensitive SKU) excluding this id
    if (sku && sku.toString().trim()) {
      const skuVal = sku.toString().trim()
      const mrpVal = mrp !== undefined ? mrp : null
      let dup
      if (req.user && req.user.store_id) {
        dup = await db.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND mrp IS NOT DISTINCT FROM $2 AND store_id = $3 AND id <> $4', [skuVal, mrpVal, req.user.store_id, id])
      } else {
        dup = await db.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND mrp IS NOT DISTINCT FROM $2 AND id <> $3', [skuVal, mrpVal, id])
      }
      if (dup.rows.length > 0) return res.status(400).json({ error: 'SKU/barcode with same MRP already exists' })
    }

    const isRepackingVal = !!is_repacking
    let result
    if (schemaCache.hasColumn('products', 'is_repacking')) {
      try {
        result = await db.query(
          // only update if product belongs to store when scoped
          req.user && req.user.store_id
            ? 'UPDATE products SET sku=$1, name=$2, price=$3, mrp=$4, unit=$5, tax_percent=$6, stock=$7, is_repacking=$8 WHERE id=$9 AND store_id=$10 RETURNING id, sku, name, price, mrp, unit, tax_percent, stock, is_repacking'
            : 'UPDATE products SET sku=$1, name=$2, price=$3, mrp=$4, unit=$5, tax_percent=$6, stock=$7, is_repacking=$8 WHERE id=$9 RETURNING id, sku, name, price, mrp, unit, tax_percent, stock, is_repacking',
          req.user && req.user.store_id
            ? [sku || null, name, price || 0, mrp || null, unit || null, tax_percent || 0, stock || 0, isRepackingVal, id, req.user.store_id]
            : [sku || null, name, price || 0, mrp || null, unit || null, tax_percent || 0, stock || 0, isRepackingVal, id]
        )
      } catch (err) {
        if (err && err.code === '42703' && /is_repacking/.test(err.message || '')) {
          // retry without is_repacking
          result = await db.query(
            // only update if product belongs to store when scoped
            req.user && req.user.store_id
              ? 'UPDATE products SET sku=$1, name=$2, price=$3, mrp=$4, unit=$5, tax_percent=$6, stock=$7 WHERE id=$8 AND store_id=$9 RETURNING id, sku, name, price, mrp, unit, tax_percent, stock'
              : 'UPDATE products SET sku=$1, name=$2, price=$3, mrp=$4, unit=$5, tax_percent=$6, stock=$7 WHERE id=$8 RETURNING id, sku, name, price, mrp, unit, tax_percent, stock',
            req.user && req.user.store_id
              ? [sku || null, name, price || 0, mrp || null, unit || null, tax_percent || 0, stock || 0, id, req.user.store_id]
              : [sku || null, name, price || 0, mrp || null, unit || null, tax_percent || 0, stock || 0, id]
          )
        } else throw err
      }
    } else {
      result = await db.query(
        // only update if product belongs to store when scoped
        req.user && req.user.store_id
          ? 'UPDATE products SET sku=$1, name=$2, price=$3, mrp=$4, unit=$5, tax_percent=$6, stock=$7 WHERE id=$8 AND store_id=$9 RETURNING id, sku, name, price, mrp, unit, tax_percent, stock'
          : 'UPDATE products SET sku=$1, name=$2, price=$3, mrp=$4, unit=$5, tax_percent=$6, stock=$7 WHERE id=$8 RETURNING id, sku, name, price, mrp, unit, tax_percent, stock',
        req.user && req.user.store_id
          ? [sku || null, name, price || 0, mrp || null, unit || null, tax_percent || 0, stock || 0, id, req.user.store_id]
          : [sku || null, name, price || 0, mrp || null, unit || null, tax_percent || 0, stock || 0, id]
      )
    }
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/products/variants/:id - update a product variant (variant-specific fields only)
router.put('/variants/:id', async (req, res) => {
  const { id } = req.params
  const { mrp, price, unit, tax_percent, stock, barcode } = req.body || {}
  if (!Number.isInteger(Number(id))) return res.status(400).json({ error: 'invalid id' })
  try {
    if (!process.env.DATABASE_URL) return res.status(400).json({ error: 'no database' })
  const storeId = req.user && req.user.store_id ? req.user.store_id : null

    // Use explicit undefined checks to allow zero/null values
    const mrpVal = (mrp === undefined) ? null : mrp
    const priceVal = (price === undefined) ? null : price
    const unitVal = (unit === undefined) ? null : unit
    const taxVal = (tax_percent === undefined) ? 0 : tax_percent
    const stockVal = (stock === undefined) ? 0 : stock
    const barcodeVal = (barcode === undefined) ? null : barcode

    let result
    if (storeId) {
      // ensure variant belongs to a product in this store
      result = await db.query(
        `UPDATE product_variants pv
         SET mrp=$1, price=$2, unit=$3, tax_percent=$4, stock=$5, barcode=$6
         FROM products p
         WHERE pv.product_id = p.id AND pv.id = $7 AND p.store_id = $8
         RETURNING pv.id, pv.product_id, pv.mrp, pv.price, pv.unit, pv.tax_percent, pv.stock, pv.barcode`,
        [mrpVal, priceVal, unitVal, taxVal, stockVal, barcodeVal, id, storeId]
      )
    } else {
      result = await db.query(
        `UPDATE product_variants SET mrp=$1, price=$2, unit=$3, tax_percent=$4, stock=$5, barcode=$6 WHERE id=$7 RETURNING id, product_id, mrp, price, unit, tax_percent, stock, barcode`,
        [mrpVal, priceVal, unitVal, taxVal, stockVal, barcodeVal, id]
      )
    }
    if (!result || !result.rows || result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router;

