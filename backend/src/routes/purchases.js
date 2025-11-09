const express = require('express')
const router = express.Router()
const db = require('../db')
const v = require('../validators')
const schemaCache = require('../schemaCache')
const tx = require('../tx')

// Factory that returns an insertItem helper bound to a transaction client.
// This avoids duplicate definitions and scoping issues between create/update flows.
function makeInsertItem(client) {
  return async function insertItem({ purchaseId, productId=null, variantId=null, sku=null, name=null, qty=0, price=0, lineTotal=0, storeId=null, tax_percent=null, cess_pct=null, unit=null, gross_amount=null }) {
    const hasTaxCol = schemaCache.hasColumn('purchase_items', 'tax_percent')
    const hasCessCol = schemaCache.hasColumn('purchase_items', 'cess_pct')
    const hasUnitCol = schemaCache.hasColumn('purchase_items', 'unit')
    const hasGrossCol = schemaCache.hasColumn('purchase_items', 'gross_amount')
    const hasTotalCol = schemaCache.hasColumn('purchase_items', 'total_amount')
    const hasTaxAmountCol = schemaCache.hasColumn('purchase_items', 'tax_amount')
    const hasAfterDiscountCol = schemaCache.hasColumn('purchase_items', 'after_discount')
    const hasDiscountPctCol = schemaCache.hasColumn('purchase_items', 'discount_pct')
    const hasDiscountRsCol = schemaCache.hasColumn('purchase_items', 'discount_rs')
    const hasVariantCol = schemaCache.hasColumn('purchase_items', 'variant_id')

    const cols = ['purchase_id', 'product_id']
    const vals = ['$1', '$2']
    const params = [purchaseId, productId]
    let idx = params.length
    if (hasVariantCol && variantId !== null) {
      cols.push('variant_id'); idx++; vals.push(`$${idx}`); params.push(variantId)
    }
    cols.push('sku','name','qty','price','line_total')
    idx += 5
    vals.push(...[`$${idx-4}`,'$'+(idx-3),'$'+(idx-2),'$'+(idx-1),'$'+idx])
    params.push(sku, name, qty, price, lineTotal)
    if (hasTaxCol) { cols.push('tax_percent'); params.push(tax_percent == null ? 0 : tax_percent); vals.push(`$${++idx}`) }
    if (hasCessCol) { cols.push('cess_pct'); params.push(cess_pct == null ? 0 : cess_pct); vals.push(`$${++idx}`) }
    if (hasUnitCol) { cols.push('unit'); params.push(unit == null ? null : unit); vals.push(`$${++idx}`) }
    if (hasGrossCol) { cols.push('gross_amount'); params.push(gross_amount == null ? null : gross_amount); vals.push(`$${++idx}`) }
  if (hasAfterDiscountCol) { cols.push('after_discount'); params.push((arguments[0] && arguments[0].after_discount) == null ? null : arguments[0].after_discount); vals.push(`$${++idx}`) }
  if (hasTaxAmountCol) { cols.push('tax_amount'); params.push((arguments[0] && arguments[0].tax_amount) == null ? null : arguments[0].tax_amount); vals.push(`$${++idx}`) }
  if (hasTotalCol) { cols.push('total_amount'); params.push((arguments[0] && arguments[0].total_amount) == null ? null : arguments[0].total_amount); vals.push(`$${++idx}`) }
  if (hasDiscountPctCol) { cols.push('discount_pct'); params.push((arguments[0] && arguments[0].discount_pct) == null ? null : arguments[0].discount_pct); vals.push(`$${++idx}`) }
  if (hasDiscountRsCol) { cols.push('discount_rs'); params.push((arguments[0] && arguments[0].discount_rs) == null ? null : arguments[0].discount_rs); vals.push(`$${++idx}`) }
    if (storeId !== null && schemaCache.hasColumn('purchase_items', 'store_id')) { cols.push('store_id'); params.push(storeId); vals.push(`$${++idx}`) }
    const sql = `INSERT INTO purchase_items (${cols.join(', ')}) VALUES (${vals.join(', ')})`
    await client.query(sql, params)
  }
}

// GET /api/purchases - list purchases (basic)
router.get('/', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ data: [], total: 0 })
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50))
    const offset = (page - 1) * limit
    // join supplier for convenience if available
    // If the request is authenticated and has a store_id, scope results to that store
    const hasStore = req.user && req.user.store_id
    let sql = `SELECT p.id, p.created_at, p.total_amount, p.metadata, s.id AS supplier_id, s.name AS supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id`
    const params = []
    if (hasStore) {
      params.push(req.user.store_id)
      sql += ` WHERE p.store_id = $${params.length}`
    }
    // include total_count window so we can return the total without a separate COUNT query
    const wrapped = `SELECT q.*, COUNT(*) OVER() AS total_count FROM (${sql}) q ORDER BY q.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)
    const r = await db.query(wrapped, params)
    const total = r.rows.length ? Number(r.rows[0].total_count || 0) : 0
    const rows = r.rows.map(rr => { const { total_count, ...rest } = rr; return rest })
    res.json({ data: rows, total })
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
    // Include product-level fields (mrp, price) so UI can prepopulate when editing line items
    // Build SELECT with optional columns only if they exist in the DB schema
    const extraSelect = []
    if (schemaCache.hasColumn('purchase_items', 'after_discount')) extraSelect.push('pi.after_discount')
    if (schemaCache.hasColumn('purchase_items', 'tax_amount')) extraSelect.push('pi.tax_amount')
    if (schemaCache.hasColumn('purchase_items', 'total_amount')) extraSelect.push('pi.total_amount')
    if (schemaCache.hasColumn('purchase_items', 'discount_pct')) extraSelect.push('pi.discount_pct')
    if (schemaCache.hasColumn('purchase_items', 'discount_rs')) extraSelect.push('pi.discount_rs')

    const selectSql = `SELECT pi.id, pi.product_id, pi.variant_id, pi.sku, pi.name, pi.qty, pi.price AS unit_price, pi.line_total, ${extraSelect.join(', ') || ''}
              , COALESCE(pv.mrp, p.mrp) AS mrp, COALESCE(pv.price, p.price) AS product_price,
              COALESCE(pi.tax_percent, pv.tax_percent, p.tax_percent, 0) AS tax_pct,
              COALESCE(pi.cess_pct, 0) AS cess_pct,
              COALESCE(pi.unit, COALESCE(pv.unit, p.unit)) AS unit,
              COALESCE(pi.gross_amount, (COALESCE(pi.price, COALESCE(pv.price, p.price)) * COALESCE(pi.qty, 0))::numeric(14,2)) AS gross_amount
       FROM purchase_items pi
       LEFT JOIN products p ON pi.product_id = p.id
       LEFT JOIN product_variants pv ON pi.variant_id = pv.id
       WHERE pi.purchase_id = $1`

    const items = await db.query(selectSql, [id])
    // Map product_price to product_price and expose mrp directly; frontend's mapper will pick up `mrp`.
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
        // helper to insert a purchase_item row bound to this transaction client
        const insertItem = makeInsertItem(client)
        // detect whether purchase_items has a store_id column
        const hasStoreCol = schemaCache.hasColumn('purchase_items', 'store_id')
        for (const it of items) {
          const qty = Number(it.qty || 0)
          const purchaseMrp = it.mrp !== undefined ? it.mrp : null
          const sku = it.sku || null
          const name = it.name || null
          const priceVal = Number(it.price) || 0
          const lineTotal = Number(it.line_total) || (qty * priceVal)

          // If product_variants table/column is not present in this DB, fall back to legacy product behavior
          let hasVariants = schemaCache.hasColumn('product_variants', 'id')
          // If the schema cache isn't initialized yet, perform a quick runtime probe to detect the table
          if (!hasVariants) {
            try {
              await client.query('SELECT 1 FROM product_variants LIMIT 1')
              hasVariants = true
            } catch (e) {
              hasVariants = false
            }
          }
          if (!hasVariants) {
            // Legacy behavior: resolve or create products and update product.stock
            let resolvedProductId = null
            async function createProductForPurchase() {
              const unitVal = it.unit || null
                const taxPct = Number(it.tax_percent ?? it.tax_pct ?? 0)
              const res = await client.query(
                'INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
                [sku, name, priceVal, purchaseMrp, unitVal, taxPct, qty, storeId]
              )
              return res.rows[0].id
            }

            const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
            if (pid) {
              const r = await client.query('SELECT id, mrp FROM products WHERE id = $1 FOR UPDATE', [pid])
              if (r.rows.length > 0) {
                const prod = r.rows[0]
                const prodMrp = prod.mrp !== undefined ? prod.mrp : null
                if ((prodMrp === null && purchaseMrp === null) || (prodMrp !== null && purchaseMrp !== null && Number(prodMrp) === Number(purchaseMrp))) {
                  await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, prod.id])
                  resolvedProductId = prod.id
                } else {
                  resolvedProductId = await createProductForPurchase()
                }
              }
            }

            if (!resolvedProductId) {
              if (sku) {
                if (storeId) {
                  const rr = await client.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND mrp IS NOT DISTINCT FROM $2 AND store_id = $3 FOR UPDATE', [sku, purchaseMrp, storeId])
                  if (rr.rows.length > 0) {
                    const pid2 = rr.rows[0].id
                    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, pid2])
                    resolvedProductId = pid2
                  }
                } else {
                  const rr = await client.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND mrp IS NOT DISTINCT FROM $2 FOR UPDATE', [sku, purchaseMrp])
                  if (rr.rows.length > 0) {
                    const pid2 = rr.rows[0].id
                    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, pid2])
                    resolvedProductId = pid2
                  }
                }
              }
            }

            if (!resolvedProductId) resolvedProductId = await createProductForPurchase()

            await insertItem({ purchaseId: created.id, productId: resolvedProductId, sku, name, qty, price: priceVal, lineTotal, storeId, tax_percent: (it.tax_percent ?? it.tax_pct), cess_pct: it.cess_pct, unit: it.unit, gross_amount: it.gross_amount, after_discount: it.after_discount, tax_amount: it.tax_amount, total_amount: it.total_amount, discount_pct: it.discount_pct, discount_rs: it.discount_rs })
            continue
          }

          // Resolve product master (by product_id or SKU)
          let productId = null
          if (v.isValidInt32(it.product_id)) productId = Number(it.product_id)
          if (!productId && sku) {
            // find product by SKU (case-insensitive) within store scope if available
            if (storeId) {
              const pr = await client.query('SELECT id FROM products WHERE LOWER(sku)=LOWER($1) AND store_id = $2', [sku, storeId])
              if (pr.rows.length > 0) productId = pr.rows[0].id
            } else {
              const pr = await client.query('SELECT id FROM products WHERE LOWER(sku)=LOWER($1)', [sku])
              if (pr.rows.length > 0) productId = pr.rows[0].id
            }
          }

          // If no product master exists, create one (minimal fields)
          if (!productId) {
            const resp = await client.query('INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [sku, name, priceVal, purchaseMrp, it.unit || null, (it.tax_percent ?? it.tax_pct ?? 0), 0, storeId])
            productId = resp.rows[0].id
          }

          // Now resolve or create a variant for this product (matched by mrp)
          // If product is marked is_repacking=true, treat purchases as updating the product master (no variants)
          const hasIsRepacking = schemaCache.hasColumn('products', 'is_repacking')
          if (hasIsRepacking) {
            try {
              const pr = await client.query('SELECT is_repacking FROM products WHERE id = $1 FOR UPDATE', [productId])
              const isRepacking = pr.rows.length ? (pr.rows[0].is_repacking === true || pr.rows[0].is_repacking === 't') : false
              if (isRepacking) {
                // Update product master: increase stock and set mrp/price to purchase values
                await client.query('UPDATE products SET stock = COALESCE(stock,0) + $1, mrp = $2, price = $3 WHERE id = $4', [qty, purchaseMrp, priceVal, productId])
                // Insert purchase item without variant_id
                await insertItem({ purchaseId: created.id, productId, sku, name, qty, price: priceVal, lineTotal, storeId, tax_percent: (it.tax_percent ?? it.tax_pct), cess_pct: it.cess_pct, unit: it.unit, gross_amount: it.gross_amount, after_discount: it.after_discount, tax_amount: it.tax_amount, total_amount: it.total_amount, discount_pct: it.discount_pct, discount_rs: it.discount_rs })
                continue
              }
            } catch (e) {
              // if something goes wrong probing is_repacking, fall back to variant flow
            }
          }

          let variantId = null
          const vrr = await client.query('SELECT id, mrp FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2 FOR UPDATE', [productId, purchaseMrp])
          if (vrr.rows.length > 0) {
            variantId = vrr.rows[0].id
            // update stock
            await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [qty, variantId])
          } else {
            // create variant
            const unitVal = it.unit || null
            const taxPct = Number(it.tax_percent ?? it.tax_pct ?? 0)
            // Use upsert to avoid duplicate variants when concurrent requests try to create the same (product_id, mrp)
            // If product had stock recorded at the product level (pre-variants), move it into the new variant
            const prodStockRow = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [productId])
            const prodStockVal = prodStockRow.rows.length ? Number(prodStockRow.rows[0].stock || 0) : 0
            let insStock = qty
            if (prodStockVal > 0) {
              insStock = prodStockVal + qty
              await client.query('UPDATE products SET stock = 0 WHERE id = $1', [productId])
            }

            const ins = await client.query(
              `INSERT INTO product_variants (product_id, mrp, price, unit, tax_percent, stock, barcode)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (product_id, mrp) DO UPDATE SET stock = product_variants.stock + EXCLUDED.stock
               RETURNING id`,
              [productId, purchaseMrp, priceVal, unitVal, taxPct, insStock, it.barcode || null]
            )
            variantId = ins.rows[0].id
          }

          // Insert purchase_item referencing productId and variantId (if available)
            await insertItem({ purchaseId: created.id, productId, variantId, sku, name, qty, price: priceVal, lineTotal, storeId, tax_percent: (it.tax_percent ?? it.tax_pct), cess_pct: it.cess_pct, unit: it.unit, gross_amount: it.gross_amount, after_discount: it.after_discount, tax_amount: it.tax_amount, total_amount: it.total_amount, discount_pct: it.discount_pct, discount_rs: it.discount_rs })
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

// PUT /api/purchases/:id - update existing purchase
router.put('/:id', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(200).json({})
  const { id } = req.params
  const { supplier_id, total_amount, metadata, items } = req.body || {}
  if (items && !Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' })
  if (items && items.length > 1000) return res.status(400).json({ error: 'too many items' })
  try {
    const result = await tx.runTransaction(async (client) => {
      const storeId = req.user && req.user.store_id ? req.user.store_id : null

      // Fetch existing purchase and ensure scoping
      const hasStore = storeId != null
      const existing = hasStore ? await client.query('SELECT id FROM purchases WHERE id=$1 AND store_id=$2', [id, storeId]) : await client.query('SELECT id FROM purchases WHERE id=$1', [id])
      if (existing.rows.length === 0) return { status: 404, json: { error: 'not found' } }

      // Load old items to reverse stock changes. If variant_id exists, use variant stock; otherwise use product stock.
      const hasVariantColOld = schemaCache.hasColumn('purchase_items', 'variant_id')
      const oldItems = hasVariantColOld
        ? await client.query('SELECT id, product_id, qty, variant_id FROM purchase_items WHERE purchase_id=$1', [id])
        : await client.query('SELECT id, product_id, qty FROM purchase_items WHERE purchase_id=$1', [id])

      // For each old item, decrement the appropriate stock (variant if present, else product)
      for (const oi of oldItems.rows) {
        const decQty = Number(oi.qty || 0)
        if (hasVariantColOld && oi.variant_id) {
          await client.query('UPDATE product_variants SET stock = GREATEST(0, stock - $1) WHERE id = $2', [decQty, oi.variant_id])
        } else if (oi.product_id) {
          await client.query('UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2', [decQty, oi.product_id])
        }
      }

      // Delete old purchase_items
      await client.query('DELETE FROM purchase_items WHERE purchase_id = $1', [id])

      // Update purchase row
      await client.query('UPDATE purchases SET supplier_id=$1, total_amount=$2, metadata=$3 WHERE id=$4', [supplier_id || null, Number(total_amount) || 0, metadata || null, id])

      // Insert new items (variant-aware, same logic as create)
      if (Array.isArray(items) && items.length > 0) {
        // helper to insert a purchase_item row bound to this transaction client
        const insertItem = makeInsertItem(client)
        const hasStoreCol = schemaCache.hasColumn('purchase_items', 'store_id')
        for (const it of items) {
          const qty = Number(it.qty || 0)
          const purchaseMrp = it.mrp !== undefined ? it.mrp : null
          const sku = it.sku || null
          const name = it.name || null
          const priceVal = Number(it.price) || 0
          const lineTotal = Number(it.line_total) || (qty * priceVal)

          // If product_variants table/column is not present in this DB, fall back to legacy product behavior
          let hasVariants = schemaCache.hasColumn('product_variants', 'id')
          // If the schema cache isn't initialized yet, perform a quick runtime probe to detect the table
          if (!hasVariants) {
            try {
              await client.query('SELECT 1 FROM product_variants LIMIT 1')
              hasVariants = true
            } catch (e) {
              hasVariants = false
            }
          }
          if (!hasVariants) {
            // Legacy behavior: resolve or create products and update product.stock
            let resolvedProductId = null
            async function createProductForPurchase() {
              const unitVal = it.unit || null
              const taxPct = Number(it.tax_percent ?? it.tax_pct ?? 0)
              const res = await client.query(
                'INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
                [sku, name, priceVal, purchaseMrp, unitVal, taxPct, qty, storeId]
              )
              return res.rows[0].id
            }

            const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
            if (pid) {
              const r = await client.query('SELECT id, mrp FROM products WHERE id = $1 FOR UPDATE', [pid])
              if (r.rows.length > 0) {
                const prod = r.rows[0]
                const prodMrp = prod.mrp !== undefined ? prod.mrp : null
                if ((prodMrp === null && purchaseMrp === null) || (prodMrp !== null && purchaseMrp !== null && Number(prodMrp) === Number(purchaseMrp))) {
                  await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, prod.id])
                  resolvedProductId = prod.id
                } else {
                  resolvedProductId = await createProductForPurchase()
                }
              }
            }

            if (!resolvedProductId) {
              if (sku) {
                if (storeId) {
                  const rr = await client.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND mrp IS NOT DISTINCT FROM $2 AND store_id = $3 FOR UPDATE', [sku, purchaseMrp, storeId])
                  if (rr.rows.length > 0) {
                    const pid2 = rr.rows[0].id
                    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, pid2])
                    resolvedProductId = pid2
                  }
                } else {
                  const rr = await client.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND mrp IS NOT DISTINCT FROM $2 FOR UPDATE', [sku, purchaseMrp])
                  if (rr.rows.length > 0) {
                    const pid2 = rr.rows[0].id
                    await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, pid2])
                    resolvedProductId = pid2
                  }
                }
              }
            }

            if (!resolvedProductId) resolvedProductId = await createProductForPurchase()

            await insertItem({ purchaseId: id, productId: resolvedProductId, sku, name, qty, price: priceVal, lineTotal, storeId, tax_percent: (it.tax_percent ?? it.tax_pct), cess_pct: it.cess_pct, unit: it.unit, gross_amount: it.gross_amount, after_discount: it.after_discount, tax_amount: it.tax_amount, total_amount: it.total_amount, discount_pct: it.discount_pct, discount_rs: it.discount_rs })
            continue
          }

          // Resolve product master (by product_id or SKU)
          let productId = null
          if (v.isValidInt32(it.product_id)) productId = Number(it.product_id)
          if (!productId && sku) {
            // find product by SKU (case-insensitive) within store scope if available
            if (storeId) {
              const pr = await client.query('SELECT id FROM products WHERE LOWER(sku)=LOWER($1) AND store_id = $2', [sku, storeId])
              if (pr.rows.length > 0) productId = pr.rows[0].id
            } else {
              const pr = await client.query('SELECT id FROM products WHERE LOWER(sku)=LOWER($1)', [sku])
              if (pr.rows.length > 0) productId = pr.rows[0].id
            }
          }

          // If no product master exists, create one (minimal fields)
          if (!productId) {
            const resp = await client.query('INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [sku, name, priceVal, purchaseMrp, it.unit || null, (it.tax_percent ?? it.tax_pct ?? 0), 0, storeId])
            productId = resp.rows[0].id
          }

          // Now resolve or create a variant for this product (matched by mrp)
          // If product is marked is_repacking=true, treat purchases as updating the product master (no variants)
          const hasIsRepacking = schemaCache.hasColumn('products', 'is_repacking')
          if (hasIsRepacking) {
            try {
              const pr = await client.query('SELECT is_repacking FROM products WHERE id = $1 FOR UPDATE', [productId])
              const isRepacking = pr.rows.length ? (pr.rows[0].is_repacking === true || pr.rows[0].is_repacking === 't') : false
              if (isRepacking) {
                // Update product master: increase stock and set mrp/price to purchase values
                await client.query('UPDATE products SET stock = COALESCE(stock,0) + $1, mrp = $2, price = $3 WHERE id = $4', [qty, purchaseMrp, priceVal, productId])
                // Insert purchase item without variant_id
                await insertItem({ purchaseId: id, productId, sku, name, qty, price: priceVal, lineTotal, storeId, tax_percent: (it.tax_percent ?? it.tax_pct), cess_pct: it.cess_pct, unit: it.unit, gross_amount: it.gross_amount, after_discount: it.after_discount, tax_amount: it.tax_amount, total_amount: it.total_amount, discount_pct: it.discount_pct, discount_rs: it.discount_rs })
                continue
              }
            } catch (e) {
              // if something goes wrong probing is_repacking, fall back to variant flow
            }
          }

          let variantId = null
          const vrr = await client.query('SELECT id, mrp FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2 FOR UPDATE', [productId, purchaseMrp])
          if (vrr.rows.length > 0) {
            variantId = vrr.rows[0].id
            // update stock
            await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [qty, variantId])
          } else {
            // create variant
            const unitVal = it.unit || null
            const taxPct = Number(it.tax_percent ?? it.tax_pct ?? 0)
            // Use upsert to avoid duplicate variants when concurrent requests try to create the same (product_id, mrp)
            // If product had stock recorded at the product level (pre-variants), move it into the new variant
            const prodStockRow = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [productId])
            const prodStockVal = prodStockRow.rows.length ? Number(prodStockRow.rows[0].stock || 0) : 0
            let insStock = qty
            if (prodStockVal > 0) {
              insStock = prodStockVal + qty
              await client.query('UPDATE products SET stock = 0 WHERE id = $1', [productId])
            }

            const ins = await client.query(
              `INSERT INTO product_variants (product_id, mrp, price, unit, tax_percent, stock, barcode)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (product_id, mrp) DO UPDATE SET stock = product_variants.stock + EXCLUDED.stock
               RETURNING id`,
              [productId, purchaseMrp, priceVal, unitVal, taxPct, insStock, it.barcode || null]
            )
            variantId = ins.rows[0].id
          }

          // Insert purchase_item referencing productId and variantId (if available)
          await insertItem({ purchaseId: id, productId, variantId, sku, name, qty, price: priceVal, lineTotal, storeId, tax_percent: (it.tax_percent ?? it.tax_pct), cess_pct: it.cess_pct, unit: it.unit, gross_amount: it.gross_amount, after_discount: it.after_discount, tax_amount: it.tax_amount, total_amount: it.total_amount, discount_pct: it.discount_pct, discount_rs: it.discount_rs })
        }
      }

      return { status: 200, json: { id: Number(id) } }
    }, { route: 'purchases.update' })

    if (result && result.status) return res.status(result.status).json(result.json)
    return res.status(500).json({ error: 'internal error' })
  } catch (err) {
    console.error('Failed to update purchase', err)
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router

