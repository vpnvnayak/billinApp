const express = require('express');
const router = express.Router();
const db = require('../db');
const v = require('../validators')
const schemaCache = require('../schemaCache')
const tx = require('../tx')
// optionalAuth middleware will populate req.user when a valid Bearer token is present

// POST /api/sales - create a sale with items. Expects { items: [{ product_id, qty, price, tax_percent, sku, name }], payment_method }
router.post('/', async (req, res) => {
  const { items, payment_method, user_id, payment_breakdown } = req.body || {}
  // incoming request body and user context are intentionally lightweight here
  if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' })

  // Basic validation of items (before acquiring DB client)
  for (const [idx, it] of items.entries()) {
    if (typeof it !== 'object' || it === null) return res.status(400).json({ error: `item[${idx}] must be an object` })
    if (!('qty' in it)) return res.status(400).json({ error: `item[${idx}].qty required` })
    if (!('price' in it)) return res.status(400).json({ error: `item[${idx}].price required` })
    if (!v.isPositiveNumber(it.qty)) return res.status(400).json({ error: `item[${idx}].qty must be a positive number` })
    if (!v.isNonNegativeNumber(it.price)) return res.status(400).json({ error: `item[${idx}].price must be a non-negative number` })
    if ('tax_percent' in it && !v.isNonNegativeNumber(it.tax_percent)) return res.status(400).json({ error: `item[${idx}].tax_percent must be a non-negative number` })
    if ('product_id' in it && it.product_id !== null && it.product_id !== undefined && !v.isValidInt32(it.product_id)) return res.status(400).json({ error: `item[${idx}].product_id must be a 32-bit integer` })
  }

  // If DB is not configured, return a fake sale id
  if (!process.env.DATABASE_URL) {
    return res.status(201).json({ id: Date.now(), items, payment_method, payment_breakdown: payment_breakdown || null })
  }

  // Use transaction helper to centralize BEGIN/COMMIT/ROLLBACK/release and metrics
  try {
    const result = await tx.runTransaction(async (client) => {
      // Check stock for each item and decrement where product_id is a valid integer.
      // Prefer product_variants when present: lock variant rows and decrement across variants.
      for (const it of items) {
        const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
        if (!pid) {
          // Skip stock enforcement for items without a valid integer product_id
          continue
        }
        const qty = Number(it.qty || 0)

        // Try to find variants for this product and lock them
        let vrows
        try {
          vrows = await client.query('SELECT id, stock FROM product_variants WHERE product_id = $1 FOR UPDATE', [pid])
        } catch (e) {
          vrows = { rows: [] }
        }

        if (vrows.rows && vrows.rows.length > 0) {
          // sum available stock across variants
          const total = vrows.rows.reduce((s, r) => s + Number(r.stock || 0), 0)
          if (total < qty) {
            return { status: 400, json: { error: `insufficient stock for product ${pid}` } }
          }
          // decrement across variants in id order until qty consumed
          let remaining = qty
          for (const vr of vrows.rows) {
            if (remaining <= 0) break
            const avail = Number(vr.stock || 0)
            if (avail <= 0) continue
            const take = Math.min(avail, remaining)
            await client.query('UPDATE product_variants SET stock = GREATEST(0, stock - $1) WHERE id = $2', [take, vr.id])
            remaining -= take
          }
        } else {
          // fallback to product-level stock
          const r = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [pid])
          if (r.rows.length === 0) {
            return { status: 400, json: { error: `product not found ${pid}` } }
          }
          const stock = Number(r.rows[0].stock || 0)
          if (stock < qty) {
            return { status: 400, json: { error: `insufficient stock for product ${pid}` } }
          }
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty, pid])
        }
      }

      // Compute totals
      let subtotal = 0; let tax_total = 0;
      for (const it of items) {
        const line = Number(it.qty || 0) * Number(it.price || 0)
        subtotal += line
        tax_total += line * ((Number(it.tax_percent || 0))/100.0)
      }
      const grand = subtotal + tax_total

      const safeUserId = v.normalizeUserId(user_id)
      if (safeUserId === null && user_id != null) {
        console.warn('sales: received user_id that is not a valid 32-bit integer, coercing to NULL:', user_id)
      }

      const storeId = req.user && req.user.store_id ? req.user.store_id : null
      // incorporate loyalty logic: payment_breakdown may include { loyalty_used: <points> }
      // award: for every 100 Rs of grand total, award 1 loyalty point
      const awardPoints = Math.floor(Number(grand || 0) / 100)
      // loyalty_used is points the customer chooses to spend (1 point == 1 Rs)
      const loyaltyUsed = (payment_breakdown && Number(payment_breakdown.loyalty_used)) ? Math.max(0, Math.floor(Number(payment_breakdown.loyalty_used))) : 0

      // Attach loyalty info to metadata for easier audit
      const metadataWithLoyalty = Object.assign({}, payment_breakdown || {}, { loyalty_awarded: awardPoints, loyalty_used: loyaltyUsed })

      const saleRes = await client.query(
        'INSERT INTO sales (user_id, subtotal, tax_total, grand_total, payment_method, metadata, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [safeUserId, subtotal.toFixed(2), tax_total.toFixed(2), grand.toFixed(2), payment_method || null, metadataWithLoyalty || null, storeId]
      )
      const saleId = saleRes.rows[0].id

      // Determine if sale_items has store_id column from schema cache
      const saleItemsHasStore = schemaCache.hasColumn('sale_items', 'store_id')

      for (const it of items) {
        const line_total = Number(it.qty || 0) * Number(it.price || 0)
        const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
        try {
          if (saleItemsHasStore && storeId) {
            await client.query(
              'INSERT INTO sale_items (sale_id, product_id, sku, name, qty, price, tax_percent, line_total, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
              [saleId, pid, it.sku || null, it.name || null, it.qty || 0, it.price || 0, it.tax_percent || 0, line_total.toFixed(2), storeId]
            )
          } else {
            await client.query(
              'INSERT INTO sale_items (sale_id, product_id, sku, name, qty, price, tax_percent, line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
              [saleId, pid, it.sku || null, it.name || null, it.qty || 0, it.price || 0, it.tax_percent || 0, line_total.toFixed(2)]
            )
          }
        } catch (e) {
          console.error('Failed inserting sale_item for sale', saleId, 'item:', { pid, sku: it.sku, name: it.name, qty: it.qty, price: it.price, tax_percent: it.tax_percent, line_total })
          throw e
        }
      }

      // If a customer (user_id) is associated, update their loyalty points atomically
      if (safeUserId) {
        try {
          // ensure customers table has loyalty_points column; fail gracefully if missing
          const hasLoyaltyCol = schemaCache.hasColumn('customers', 'loyalty_points')
          if (hasLoyaltyCol) {
            // Deduct used points first (if any), then add awarded points
            if (loyaltyUsed > 0) {
              // decrement but not below zero
              await client.query('UPDATE customers SET loyalty_points = GREATEST(coalesce(loyalty_points,0) - $1, 0) WHERE id = $2', [loyaltyUsed, safeUserId])
            }
            if (awardPoints > 0) {
              await client.query('UPDATE customers SET loyalty_points = coalesce(loyalty_points,0) + $1 WHERE id = $2', [awardPoints, safeUserId])
            }
          }
        } catch (e) {
          console.error('Failed updating customer loyalty points', e)
          // not fatal: continue
        }
      }
      return { status: 201, json: { id: saleId, loyalty_awarded: awardPoints, loyalty_used: loyaltyUsed } }
    }, { route: 'sales.create' })

    if (result && result.status) {
      return res.status(result.status).json(result.json)
    }
    // Should not reach here, but handle as server error
    res.status(500).json({ error: 'internal error' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router;

// Add list and detail endpoints
// GET /api/sales - optional query: from, to (YYYY-MM-DD)
router.get('/', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json([])
  const { from, to } = req.query
  try {
    // join customers to expose name/phone/email alongside metadata for convenience
    let sql = `SELECT s.id, s.created_at, s.subtotal, s.tax_total, s.grand_total, s.payment_method, s.metadata,
      c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
      FROM sales s LEFT JOIN customers c ON s.user_id = c.id`
    const params = []
    const clauses = []
  const hasStore = (req.user && req.user.store_id)
    if (hasStore) {
      const sid = req.user.store_id
      params.push(sid)
      clauses.push(`s.store_id = $${params.length}`)
    }
    if (from) { params.push(from); clauses.push(`s.created_at::date >= $${params.length}`) }
    if (to) { params.push(to); clauses.push(`s.created_at::date <= $${params.length}`) }
    if (clauses.length > 0) sql += ' WHERE ' + clauses.join(' AND ')
    sql += ' ORDER BY s.created_at DESC LIMIT 200'
    const r = await db.query(sql, params)
    // merge customer fields into metadata for client convenience
    const rows = r.rows.map(row => {
      const meta = row.metadata || {}
      try {
        // if metadata is JSON text, leave as-is (db returns JSONB -> object)
      } catch (e) {}
      return Object.assign({}, row, { metadata: meta, metadata_customer_name: row.customer_name || null, metadata_customer_phone: row.customer_phone || null, metadata_customer_email: row.customer_email || null })
    })
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

// GET /api/sales/:id - detail with items
router.get('/:id', async (req, res) => {
  const { id } = req.params
  if (!Number.isInteger(Number(id))) return res.status(400).json({ error: 'invalid id' })
  if (!process.env.DATABASE_URL) return res.json({ id, items: [] })
  try {
    // scope by store if available
    const hasStore = (req.user && req.user.store_id)
      let s
        if (hasStore) {
          const sid = req.user.store_id
          s = await db.query('SELECT s.id, s.created_at, s.subtotal, s.tax_total, s.grand_total, s.payment_method, s.metadata, c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email FROM sales s LEFT JOIN customers c ON s.user_id = c.id WHERE s.id=$1 AND s.store_id=$2', [id, sid])
      } else {
        s = await db.query('SELECT s.id, s.created_at, s.subtotal, s.tax_total, s.grand_total, s.payment_method, s.metadata, c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email FROM sales s LEFT JOIN customers c ON s.user_id = c.id WHERE s.id=$1', [id])
      }
    if (s.rows.length === 0) return res.status(404).json({ error: 'not found' })
  // scope sale_items by store when sale_items has store_id column and request is scoped
  let items
  try {
    const hasStoreCol = schemaCache.hasColumn('sale_items', 'store_id')
    if (hasStoreCol && hasStore) {
      items = await db.query('SELECT id, product_id, sku, name, qty, price, tax_percent, line_total FROM sale_items WHERE sale_id=$1 AND store_id=$2', [id, req.user.store_id])
    } else {
      items = await db.query('SELECT id, product_id, sku, name, qty, price, tax_percent, line_total FROM sale_items WHERE sale_id=$1', [id])
    }
  } catch (e) {
    // fallback: best-effort to return items
    items = await db.query('SELECT id, product_id, sku, name, qty, price, tax_percent, line_total FROM sale_items WHERE sale_id=$1', [id])
  }
    const sale = s.rows[0]
    // merge customer info into metadata object for client convenience
    const metadata = sale.metadata || {}
    if (sale.customer_name) metadata.customer_name = metadata.customer_name || sale.customer_name
    if (sale.customer_phone) metadata.customer_phone = metadata.customer_phone || sale.customer_phone
    if (sale.customer_email) metadata.customer_email = metadata.customer_email || sale.customer_email
    sale.metadata = metadata
    res.json({ sale, items: items.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})
