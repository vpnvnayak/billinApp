const express = require('express');
const router = express.Router();
const db = require('../db');
const v = require('../validators')
const schemaCache = require('../schemaCache')
const tx = require('../tx')
const logger = require('../logger')
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
  // touched to refresh schema cache
  try {
    const result = await tx.runTransaction(async (client) => {
  // Check stock for each item and decrement where product_id is a valid integer.
  // Prefer product_variants when present: if item.variant_id is provided, lock that variant row
  // and decrement only that variant; otherwise fall back to the existing behaviour of consuming
  // stock across variants or product-level stock.
      for (const it of items) {
        const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
        if (!pid) {
          // Skip stock enforcement for items without a valid integer product_id
          continue
        }
        const qty = Number(it.qty || 0)

        // If client specified a variant_id and sale_items supports variant_id, attempt to lock that row
        // and decrement only that variant's stock.
        const specifiedVariantId = v.isValidInt32(it.variant_id) ? Number(it.variant_id) : null
        if (specifiedVariantId) {
          // Lock the specified variant row
          const vr = await client.query('SELECT id, stock, product_id FROM product_variants WHERE id = $1 FOR UPDATE', [specifiedVariantId])
          if (vr.rows.length === 0) {
            return { status: 400, json: { error: `variant not found ${specifiedVariantId}` } }
          }
          if (Number(vr.rows[0].product_id) !== pid) {
            return { status: 400, json: { error: `variant ${specifiedVariantId} does not belong to product ${pid}` } }
          }
          const avail = Number(vr.rows[0].stock || 0)
          if (avail < qty) {
            return { status: 400, json: { error: `insufficient stock for variant ${specifiedVariantId}` } }
          }
          await client.query('UPDATE product_variants SET stock = GREATEST(0, stock - $1::numeric) WHERE id = $2', [qty, specifiedVariantId])
          continue
        }

        // If client requested using product-level stock (master product was selected), lock product row and decrement
        if (it.use_product_stock) {
          const pr = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [pid])
          if (pr.rows.length === 0) return { status: 400, json: { error: `product not found ${pid}` } }
          const pstock = Number(pr.rows[0].stock || 0)
          if (pstock < qty) return { status: 400, json: { error: `insufficient product stock for product ${pid}` } }
          await client.query('UPDATE products SET stock = stock - $1::numeric WHERE id = $2', [qty, pid])
          continue
        }

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
            // treat the decrement as numeric to support decimal quantities (e.g. 3.5)
            await client.query('UPDATE product_variants SET stock = GREATEST(0, stock - $1::numeric) WHERE id = $2', [take, vr.id])
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
          // support decimal quantities by using numeric arithmetic (migration may change products.stock to NUMERIC)
          await client.query('UPDATE products SET stock = stock - $1::numeric WHERE id = $2', [qty, pid])
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

      // Compute paid amount from payment_breakdown (card/cash/upi). Default to 0 when missing.
      const paidAmount = (payment_breakdown ? (Number(payment_breakdown.card||0) + Number(payment_breakdown.cash||0) + Number(payment_breakdown.upi||0)) : 0)

      // Payable: grand total (use grand as computed). Payment and loyalty interplay:
      // Deduct requested loyalty_used first (clamped to available). Then if paidAmount + requested < grand, auto-apply remaining loyalty up to deficit.
      let totalLoyaltyUsed = 0
      // priorCredit must be visible later when updating customer's credit_due
      let priorCredit = 0
      const metadataWithLoyalty = Object.assign({}, payment_breakdown || {}, { loyalty_awarded: awardPoints, loyalty_used: 0 })
      if (safeUserId) {
        try {
          // Attempt to lock and read customer's loyalty_points. If column missing this will throw and be caught.
          // lock and read customer's loyalty points and existing credit due
          const cres = await client.query('SELECT COALESCE(loyalty_points,0) AS loyalty_points, COALESCE(credit_due,0)::numeric AS credit_due FROM customers WHERE id = $1 FOR UPDATE', [safeUserId])
          let avail = Number((cres.rows[0] && cres.rows[0].loyalty_points) || 0)
          priorCredit = Number((cres.rows[0] && cres.rows[0].credit_due) || 0)
          // Deduct requested loyalty_used (clamped)
          const requested = Math.max(0, Math.floor(Number(loyaltyUsed || 0)))
          const deductRequested = Math.min(avail, requested)
          if (deductRequested > 0) {
            await client.query('UPDATE customers SET loyalty_points = GREATEST(coalesce(loyalty_points,0) - $1, 0) WHERE id = $2', [deductRequested, safeUserId])
            avail -= deductRequested
          }
          totalLoyaltyUsed = deductRequested

            // If still unpaid after paidAmount + requested, and there was some paid amount, auto-apply remaining loyalty up to deficit
            const paidPlusRequested = Number(paidAmount || 0) + totalLoyaltyUsed
            if ((Number(paidAmount || 0) > 0) && paidPlusRequested < Number(grand || 0) && avail > 0) {
            const deficit = Math.max(0, Number(grand || 0) - paidPlusRequested)
            const autoToUse = Math.min(avail, Math.max(0, Math.floor(deficit)))
            if (autoToUse > 0) {
              await client.query('UPDATE customers SET loyalty_points = GREATEST(coalesce(loyalty_points,0) - $1, 0) WHERE id = $2', [autoToUse, safeUserId])
              totalLoyaltyUsed += autoToUse
              avail -= autoToUse
            }
          }
          // Record loyalty available after deductions so receipt can reliably show remaining points.
          // For audit we keep metadata.loyalty_used as requested by client (may be more than actually deducted).
          metadataWithLoyalty.loyalty_used = loyaltyUsed
          metadataWithLoyalty.loyalty_available = Number(avail || 0)
        } catch (e) {
          console.error('Failed auto/apply loyalty', e)
        }
      }

      const saleRes = await client.query(
        'INSERT INTO sales (user_id, subtotal, tax_total, grand_total, payment_method, metadata, store_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [safeUserId, subtotal.toFixed(2), tax_total.toFixed(2), grand.toFixed(2), payment_method || null, metadataWithLoyalty || null, storeId]
      )
      const saleId = saleRes.rows[0].id

  // Determine if sale_items has store_id column from schema cache

      // Prepare to persist each item's snapshot so receipts can rely on saved data later.
      const hasMrpCol = schemaCache.hasColumn('sale_items', 'mrp')
      const saleItemsHasStore = schemaCache.hasColumn('sale_items', 'store_id')
      const saleItemsHasVariant = schemaCache.hasColumn('sale_items', 'variant_id')
      for (const it of items) {
        const qtyVal = Number(it.qty || 0)
        const priceVal = Number(it.price || 0)
        const line_total = qtyVal * priceVal
        const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
        try {
          // Determine authoritative snapshot values. Prefer client-provided values for price/qty
          // (these reflect what the customer was charged). For mrp and tax_percent prefer variant -> product -> provided values.
          let mrpVal = (typeof it.mrp !== 'undefined' && it.mrp !== null) ? Number(it.mrp) : null
          let taxPercentVal = (typeof it.tax_percent !== 'undefined' && it.tax_percent !== null) ? Number(it.tax_percent) : 0
          let skuVal = it.sku || null
          let nameVal = it.name || null

          if (pid) {
            // fetch product for base fields
            const pr = await client.query('SELECT sku, name, mrp AS product_mrp, price AS product_price, tax_percent AS product_tax FROM products WHERE id = $1', [pid])
            const p = pr.rows && pr.rows[0] ? pr.rows[0] : null
            if (p) {
              skuVal = skuVal || p.sku || null
              nameVal = nameVal || p.name || null
              // if mrp not provided, consider product-level mrp/price as fallback
              if (mrpVal === null) {
                if (p.product_mrp != null) mrpVal = Number(p.product_mrp)
                else if (p.product_price != null) mrpVal = Number(p.product_price)
              }
              if ((!taxPercentVal || taxPercentVal === 0) && (p.product_tax != null)) {
                taxPercentVal = Number(p.product_tax)
              }
            }

            // if a variant_id was specified, prefer variant's values
            const vid = v.isValidInt32(it.variant_id) ? Number(it.variant_id) : null
            if (vid) {
              try {
                const vr = await client.query('SELECT mrp AS variant_mrp, price AS variant_price, tax_percent AS variant_tax, barcode FROM product_variants WHERE id = $1', [vid])
                const vrow = vr.rows && vr.rows[0] ? vr.rows[0] : null
                if (vrow) {
                  // prefer variant mrp over previously chosen mrp
                  if (vrow.variant_mrp != null) mrpVal = Number(vrow.variant_mrp)
                  // prefer variant tax if product didn't have tax
                  if (vrow.variant_tax != null) taxPercentVal = Number(vrow.variant_tax)
                  // variant doesn't have name/sku fields in this schema; keep product names
                }
              } catch (e) {
                // variant lookup failed - continue with product-level values
              }
            }
          }

          // Fallbacks: if mrp still null set to priceVal
          if (mrpVal === null || isNaN(mrpVal)) mrpVal = Number(priceVal || 0)

          // Build a dynamic INSERT that includes optional columns when present in the schema.
          // This ensures we always persist variant_id when the column exists, even if storeId is null.
          const cols = ['sale_id','product_id']
          const vals = [saleId, pid]
          if (saleItemsHasVariant) { cols.push('variant_id'); vals.push(v.isValidInt32(it.variant_id) ? Number(it.variant_id) : null) }
          cols.push('sku'); vals.push(skuVal)
          cols.push('name'); vals.push(nameVal)
          cols.push('qty'); vals.push(qtyVal)
          cols.push('price'); vals.push(priceVal)
          cols.push('tax_percent'); vals.push(taxPercentVal)
          cols.push('line_total'); vals.push(line_total.toFixed(2))
          if (hasMrpCol) { cols.push('mrp'); vals.push(mrpVal.toFixed(2)) }
          // include store_id column when it exists; insert NULL if storeId is not set
          if (saleItemsHasStore) { cols.push('store_id'); vals.push(storeId || null) }
          // include is_discounted flag if provided
          const hasIsDiscounted = schemaCache.hasColumn('sale_items', 'is_discounted')
          if (hasIsDiscounted) { cols.push('is_discounted'); vals.push(!!it.is_discounted) }

          const placeholders = vals.map((_, i) => `$${i+1}`).join(',')
          const sql = `INSERT INTO sale_items (${cols.join(',')}) VALUES (${placeholders})`
          await client.query(sql, vals)
        } catch (e) {
          console.error('Failed inserting sale_item for sale', saleId, 'item:', { pid, sku: it.sku, name: it.name, qty: it.qty, price: it.price, tax_percent: it.tax_percent, line_total })
          throw e
        }
      }
      // If a customer (user_id) is associated, award loyalty points (and ensure any auto loyalty was recorded above).
      // Also handle credit: if paidAmount + totalLoyaltyUsed < grand and customer exists, add the remaining amount to customers.credit_due
      if (safeUserId) {
        try {
          // award points
          const hasLoyaltyCol = schemaCache.hasColumn('customers', 'loyalty_points')
          if (hasLoyaltyCol && awardPoints > 0) {
            await client.query('UPDATE customers SET loyalty_points = coalesce(loyalty_points,0) + $1 WHERE id = $2', [awardPoints, safeUserId])
          }

          // compute remaining unpaid after payments and loyalty
          const paidPlusLoyalty = Number(paidAmount || 0) + Number(totalLoyaltyUsed || 0)
          // include any prior customer credit into total due for this sale
          const totalDue = Number(grand || 0) + (Number(priorCredit || 0))
          const deficit = Math.max(0, totalDue - paidPlusLoyalty)
          const hasCreditCol = schemaCache.hasColumn('customers', 'credit_due')
          if (hasCreditCol) {
            // set customer's credit_due to the new outstanding (deficit). This avoids double-counting prior credit.
            await client.query('UPDATE customers SET credit_due = $1 WHERE id = $2', [deficit.toFixed(2), safeUserId])
            // annotate metadata with previous and new credit for audit
            metadataWithLoyalty.previous_credit = priorCredit
            metadataWithLoyalty.credit_added = deficit
            // update the sales metadata to include credit info
            await client.query('UPDATE sales SET metadata = $1 WHERE id = $2', [metadataWithLoyalty || null, saleId])
          }
        } catch (e) {
          console.error('Failed updating customer loyalty/credit', e)
          // not fatal: continue
        }
      }
  return { status: 201, json: { id: saleId, loyalty_awarded: awardPoints, loyalty_used: (loyaltyUsed || 0) } }
    }, { route: 'sales.create' })

    // Log sale creation for audit (query the saved sale & items so we have authoritative snapshot)
    try {
      const createdId = result && result.json && result.json.id ? Number(result.json.id) : null
      if (createdId) {
        try {
          const sres = await db.query('SELECT id, created_at, subtotal, tax_total, grand_total, payment_method, metadata, store_id FROM sales WHERE id = $1', [createdId])
          const sit = await db.query('SELECT id, product_id, variant_id, sku, name, qty, price, tax_percent, line_total FROM sale_items WHERE sale_id = $1', [createdId])
          const saleRow = sres.rows && sres.rows[0] ? sres.rows[0] : null
          const saleItems = sit.rows || []
          const newSale = Object.assign({}, saleRow, { items: saleItems })
          // non-blocking
          // Single consolidated log entry (avoid duplicate POS vs sales entries).
          // Include invoice-specific metadata fields so UI can still filter.
          // gather user/ip context for log meta
          const logUserId = req.user && (req.user.sub || req.user.userId || req.user.id) ? (req.user.sub || req.user.userId || req.user.id) : null
          const logUserEmail = req.user && req.user.email ? req.user.email : null
          const logUserName = req.user && (req.user.full_name || req.user.name) ? (req.user.full_name || req.user.name) : null
          const logUserRoles = req.user && req.user.roles ? req.user.roles : null
          const logIp = (req && (req.ip || (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])))) || null
          const actor = { id: logUserId, email: logUserEmail, name: logUserName, roles: logUserRoles, ip: logIp }

          /* logger.info(
            'Sale created',
            {
              action: 'sale.create',
              module: 'sales',
              sale: newSale,
              pos_invoice: true,
              items_count: Array.isArray(saleItems) ? saleItems.length : 0,
              grand_total: saleRow ? saleRow.grand_total : undefined,
              payment_method: saleRow ? saleRow.payment_method : undefined,
              // user/ip context (backwards-compatible flat fields)
              userId: logUserId,
              user_id: logUserId,
              userEmail: logUserEmail,
              userName: logUserName,
              userRoles: logUserRoles,
              ip: logIp,
              // structured actor info
              actor
            },
            saleRow && saleRow.store_id || storeId
          ).catch(()=>{}) */
        } catch (inner) {
          // if querying fails, still attempt to log basic info
          try {
              try {
              const logUserId2 = req.user && (req.user.sub || req.user.userId || req.user.id) ? (req.user.sub || req.user.userId || req.user.id) : null
              const logUserEmail2 = req.user && req.user.email ? req.user.email : null
              const logUserName2 = req.user && (req.user.full_name || req.user.name) ? (req.user.full_name || req.user.name) : null
              const logUserRoles2 = req.user && req.user.roles ? req.user.roles : null
              const logIp2 = (req && (req.ip || (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])))) || null
              const actor2 = { id: logUserId2, email: logUserEmail2, name: logUserName2, roles: logUserRoles2, ip: logIp2 }
              /* logger.info('Sale created', {
                action: 'sale.create',
                module: 'sales',
                sale_id: createdId,
                pos_invoice: true,
                userId: logUserId2,
                user_id: logUserId2,
                userEmail: logUserEmail2,
                userName: logUserName2,
                userRoles: logUserRoles2,
                ip: logIp2,
                actor: actor2
              }, storeId).catch(()=>{}) */
            } catch (e) {}
          } catch (e) {}
        }
      }
    } catch (e) {}

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

// PUT /api/sales/:id - update sale (metadata, payment_method)
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' })
  const { metadata, payment_method, items } = req.body || {}
  if (metadata === undefined && payment_method === undefined && items === undefined) return res.status(400).json({ error: 'nothing to update' })

  // If only metadata/payment_method update requested, keep the lightweight path
  if (items === undefined) {
    try {
      const s = await db.query('SELECT * FROM sales WHERE id = $1', [id])
      if (s.rows.length === 0) return res.status(404).json({ error: 'not found' })
      const parts = []
      const vals = []
      let idx = 1
      if (payment_method !== undefined) { parts.push(`payment_method = $${idx++}`); vals.push(payment_method || null) }
      if (metadata !== undefined) { parts.push(`metadata = $${idx++}`); vals.push(metadata || null) }
      if (parts.length) {
        vals.push(id)
        await db.query(`UPDATE sales SET ${parts.join(', ')} WHERE id = $${vals.length}`, vals)
      }
      const afterRes = await db.query('SELECT * FROM sales WHERE id = $1', [id])
      const after = afterRes.rows[0]
      const itemsRes = await db.query('SELECT * FROM sale_items WHERE sale_id = $1', [id])
      const afterItems = itemsRes.rows || []
      try {
        const logUserId = req.user && (req.user.sub || req.user.userId || req.user.id) ? (req.user.sub || req.user.userId || req.user.id) : null
        const logUserEmail = req.user && req.user.email ? req.user.email : null
        const logUserName = req.user && (req.user.full_name || req.user.name) ? (req.user.full_name || req.user.name) : null
        const logUserRoles = req.user && req.user.roles ? req.user.roles : null
        const logIp = (req && (req.ip || (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])))) || null
        const actor = { id: logUserId, email: logUserEmail, name: logUserName, roles: logUserRoles, ip: logIp }
        const metaLog = { action: 'sale.update', module: 'sales', sale_id: id, before: { sale: s.rows[0] }, after: { sale: after, items: afterItems }, actor, userId: logUserId, userEmail: logUserEmail, userName: logUserName }
        logger.info('Sale updated', metaLog, req.user && req.user.store_id || null).catch(()=>{})
      } catch (e) {}
      return res.json({ id: after.id })
    } catch (e) {
      console.error('Failed to update sale', e)
      return res.status(500).json({ error: 'internal error' })
    }
  }

  // Full edit including items: perform transaction to reconcile stock and update sale snapshot
  try {
    const result = await tx.runTransaction(async (client) => {
      // load existing sale and items
      const sres = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [id])
      if (sres.rows.length === 0) return { status: 404, json: { error: 'not found' } }
      const before = sres.rows[0]
      const beforeItemsRes = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [id])
      const beforeItems = beforeItemsRes.rows || []

      // attempt to reverse any loyalty/credit effects from previous sale (best-effort)
      const prevMeta = before.metadata || {}
      const prevUserId = before.user_id || null
      if (prevUserId) {
        try {
          const hasLoyaltyCol = schemaCache.hasColumn('customers', 'loyalty_points')
          const hasCreditCol = schemaCache.hasColumn('customers', 'credit_due')
          if (hasLoyaltyCol && prevMeta && Number(prevMeta.loyalty_awarded || 0) > 0) {
            const revoke = Math.min(Number(prevMeta.loyalty_awarded || 0), Number(prevMeta.loyalty_awarded || 0))
            await client.query('UPDATE customers SET loyalty_points = GREATEST(coalesce(loyalty_points,0) - $1, 0) WHERE id = $2', [revoke, prevUserId])
          }
          if (hasCreditCol && prevMeta && typeof prevMeta.previous_credit !== 'undefined') {
            // restore previous credit value
            await client.query('UPDATE customers SET credit_due = $1 WHERE id = $2', [Number(prevMeta.previous_credit || 0), prevUserId])
          }
        } catch (e) {
          console.error('Failed to reverse previous loyalty/credit', e)
        }
      }

      // Restore stock for previous items: add back quantities
      try {
        for (const it of beforeItems) {
          const vid = v.isValidInt32(it.variant_id) ? Number(it.variant_id) : null
          const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
          const qty = Number(it.qty || 0)
          if (qty <= 0) continue
          if (vid) {
            await client.query('UPDATE product_variants SET stock = stock + $1::numeric WHERE id = $2', [qty, vid])
          } else if (pid) {
            // restore to product-level stock
            await client.query('UPDATE products SET stock = stock + $1::numeric WHERE id = $2', [qty, pid])
          }
        }
      } catch (e) {
        console.error('Failed to restore stock for previous sale items', e)
        throw e
      }

      // Delete previous sale_items rows
      await client.query('DELETE FROM sale_items WHERE sale_id = $1', [id])

      // Validate incoming items array
      if (!items || !Array.isArray(items) || items.length === 0) return { status: 400, json: { error: 'items required' } }
      for (const [idx, it] of items.entries()) {
        if (typeof it !== 'object' || it === null) return { status: 400, json: { error: `item[${idx}] must be an object` } }
        if (!('qty' in it)) return { status: 400, json: { error: `item[${idx}].qty required` } }
        if (!('price' in it)) return { status: 400, json: { error: `item[${idx}].price required` } }
        if (!v.isPositiveNumber(it.qty)) return { status: 400, json: { error: `item[${idx}].qty must be a positive number` } }
        if (!v.isNonNegativeNumber(it.price)) return { status: 400, json: { error: `item[${idx}].price must be a non-negative number` } }
        if ('tax_percent' in it && !v.isNonNegativeNumber(it.tax_percent)) return { status: 400, json: { error: `item[${idx}].tax_percent must be a non-negative number` } }
        if ('product_id' in it && it.product_id !== null && it.product_id !== undefined && !v.isValidInt32(it.product_id)) return { status: 400, json: { error: `item[${idx}].product_id must be a 32-bit integer` } }
      }

      // Now apply new items: check and decrement stock similar to create flow
      for (const it of items) {
        const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
        if (!pid) continue
        const qty = Number(it.qty || 0)
        const specifiedVariantId = v.isValidInt32(it.variant_id) ? Number(it.variant_id) : null
        if (specifiedVariantId) {
          const vr = await client.query('SELECT id, stock, product_id FROM product_variants WHERE id = $1 FOR UPDATE', [specifiedVariantId])
          if (vr.rows.length === 0) return { status: 400, json: { error: `variant not found ${specifiedVariantId}` } }
          if (Number(vr.rows[0].product_id) !== pid) return { status: 400, json: { error: `variant ${specifiedVariantId} does not belong to product ${pid}` } }
          const avail = Number(vr.rows[0].stock || 0)
          if (avail < qty) return { status: 400, json: { error: `insufficient stock for variant ${specifiedVariantId}` } }
          await client.query('UPDATE product_variants SET stock = GREATEST(0, stock - $1::numeric) WHERE id = $2', [qty, specifiedVariantId])
          continue
        }

        if (it.use_product_stock) {
          const pr = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [pid])
          if (pr.rows.length === 0) return { status: 400, json: { error: `product not found ${pid}` } }
          const pstock = Number(pr.rows[0].stock || 0)
          if (pstock < qty) return { status: 400, json: { error: `insufficient product stock for product ${pid}` } }
          await client.query('UPDATE products SET stock = stock - $1::numeric WHERE id = $2', [qty, pid])
          continue
        }

        // Try to find variants for this product and lock them
        let vrows
        try {
          vrows = await client.query('SELECT id, stock FROM product_variants WHERE product_id = $1 FOR UPDATE', [pid])
        } catch (e) {
          vrows = { rows: [] }
        }

        if (vrows.rows && vrows.rows.length > 0) {
          const total = vrows.rows.reduce((s, r) => s + Number(r.stock || 0), 0)
          if (total < qty) return { status: 400, json: { error: `insufficient stock for product ${pid}` } }
          let remaining = qty
          for (const vr of vrows.rows) {
            if (remaining <= 0) break
            const avail = Number(vr.stock || 0)
            if (avail <= 0) continue
            const take = Math.min(avail, remaining)
            await client.query('UPDATE product_variants SET stock = GREATEST(0, stock - $1::numeric) WHERE id = $2', [take, vr.id])
            remaining -= take
          }
        } else {
          const r = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [pid])
          if (r.rows.length === 0) return { status: 400, json: { error: `product not found ${pid}` } }
          const stock = Number(r.rows[0].stock || 0)
          if (stock < qty) return { status: 400, json: { error: `insufficient stock for product ${pid}` } }
          await client.query('UPDATE products SET stock = stock - $1::numeric WHERE id = $2', [qty, pid])
        }
      }

      // Compute totals for new items
      let subtotal = 0; let tax_total = 0
      for (const it of items) {
        const line = Number(it.qty || 0) * Number(it.price || 0)
        subtotal += line
        tax_total += line * ((Number(it.tax_percent || 0))/100.0)
      }
      const grand = subtotal + tax_total

      // Update sale row with new totals and metadata/payment_method
      const safeMetadata = metadata !== undefined ? metadata : before.metadata
      const safePaymentMethod = payment_method !== undefined ? payment_method : before.payment_method
      await client.query('UPDATE sales SET subtotal=$1, tax_total=$2, grand_total=$3, payment_method=$4, metadata=$5 WHERE id=$6', [subtotal.toFixed(2), tax_total.toFixed(2), grand.toFixed(2), safePaymentMethod || null, safeMetadata || null, id])

      // Insert new sale_items snapshot
      const hasMrpCol = schemaCache.hasColumn('sale_items', 'mrp')
      const saleItemsHasStore = schemaCache.hasColumn('sale_items', 'store_id')
      const saleItemsHasVariant = schemaCache.hasColumn('sale_items', 'variant_id')
      const storeId = req.user && req.user.store_id ? req.user.store_id : null
      for (const it of items) {
        const qtyVal = Number(it.qty || 0)
        const priceVal = Number(it.price || 0)
        const line_total = qtyVal * priceVal
        const pid = v.isValidInt32(it.product_id) ? Number(it.product_id) : null
        try {
          let mrpVal = (typeof it.mrp !== 'undefined' && it.mrp !== null) ? Number(it.mrp) : null
          let taxPercentVal = (typeof it.tax_percent !== 'undefined' && it.tax_percent !== null) ? Number(it.tax_percent) : 0
          let skuVal = it.sku || null
          let nameVal = it.name || null
          if (pid) {
            const pr = await client.query('SELECT sku, name, mrp AS product_mrp, price AS product_price, tax_percent AS product_tax FROM products WHERE id = $1', [pid])
            const p = pr.rows && pr.rows[0] ? pr.rows[0] : null
            if (p) {
              skuVal = skuVal || p.sku || null
              nameVal = nameVal || p.name || null
              if (mrpVal === null) {
                if (p.product_mrp != null) mrpVal = Number(p.product_mrp)
                else if (p.product_price != null) mrpVal = Number(p.product_price)
              }
              if ((!taxPercentVal || taxPercentVal === 0) && (p.product_tax != null)) {
                taxPercentVal = Number(p.product_tax)
              }
            }
            const vid = v.isValidInt32(it.variant_id) ? Number(it.variant_id) : null
            if (vid) {
              try {
                const vr = await client.query('SELECT mrp AS variant_mrp, price AS variant_price, tax_percent AS variant_tax, barcode FROM product_variants WHERE id = $1', [vid])
                const vrow = vr.rows && vr.rows[0] ? vr.rows[0] : null
                if (vrow) {
                  if (vrow.variant_mrp != null) mrpVal = Number(vrow.variant_mrp)
                  if (vrow.variant_tax != null) taxPercentVal = Number(vrow.variant_tax)
                }
              } catch (e) {}
            }
          }
          if (mrpVal === null || isNaN(mrpVal)) mrpVal = Number(priceVal || 0)
          const cols = ['sale_id','product_id']
          const vals = [id, pid]
          if (saleItemsHasVariant) { cols.push('variant_id'); vals.push(v.isValidInt32(it.variant_id) ? Number(it.variant_id) : null) }
          cols.push('sku'); vals.push(skuVal)
          cols.push('name'); vals.push(nameVal)
          cols.push('qty'); vals.push(qtyVal)
          cols.push('price'); vals.push(priceVal)
          cols.push('tax_percent'); vals.push(taxPercentVal)
          cols.push('line_total'); vals.push(line_total.toFixed(2))
          if (hasMrpCol) { cols.push('mrp'); vals.push(mrpVal.toFixed(2)) }
          if (saleItemsHasStore) { cols.push('store_id'); vals.push(storeId || null) }
          // include is_discounted flag if provided
          const hasIsDiscounted = schemaCache.hasColumn('sale_items', 'is_discounted')
          if (hasIsDiscounted) { cols.push('is_discounted'); vals.push(!!it.is_discounted) }
          const placeholders = vals.map((_, i) => `$${i+1}`).join(',')
          const sql = `INSERT INTO sale_items (${cols.join(',')}) VALUES (${placeholders})`
          await client.query(sql, vals)
        } catch (e) {
          console.error('Failed inserting sale_item for sale', id, 'item:', { pid, sku: it.sku, name: it.name, qty: it.qty, price: it.price })
          throw e
        }
      }

      // After inserting new items, handle loyalty/credit similar to create flow
      const safeUserId = v.normalizeUserId(before.user_id)
      const awardPoints = Math.floor(Number(grand || 0) / 100)
      const payment_breakdown = (metadata && metadata.payment_breakdown) ? metadata.payment_breakdown : (metadata || {})
      const loyaltyUsed = (payment_breakdown && Number(payment_breakdown.loyalty_used)) ? Math.max(0, Math.floor(Number(payment_breakdown.loyalty_used))) : 0
      let totalLoyaltyUsed = 0
      let priorCredit = 0
      const metadataWithLoyalty = Object.assign({}, payment_breakdown || {}, { loyalty_awarded: awardPoints, loyalty_used: loyaltyUsed })
      if (safeUserId) {
        try {
          const cres = await client.query('SELECT COALESCE(loyalty_points,0) AS loyalty_points, COALESCE(credit_due,0)::numeric AS credit_due FROM customers WHERE id = $1 FOR UPDATE', [safeUserId])
          let avail = Number((cres.rows[0] && cres.rows[0].loyalty_points) || 0)
          priorCredit = Number((cres.rows[0] && cres.rows[0].credit_due) || 0)
          const requested = Math.max(0, Math.floor(Number(loyaltyUsed || 0)))
          const deductRequested = Math.min(avail, requested)
          if (deductRequested > 0) {
            await client.query('UPDATE customers SET loyalty_points = GREATEST(coalesce(loyalty_points,0) - $1, 0) WHERE id = $2', [deductRequested, safeUserId])
            avail -= deductRequested
          }
          totalLoyaltyUsed = deductRequested
          const paidAmount = (payment_breakdown ? (Number(payment_breakdown.card||0) + Number(payment_breakdown.cash||0) + Number(payment_breakdown.upi||0)) : 0)
          const paidPlusRequested = Number(paidAmount || 0) + totalLoyaltyUsed
          if ((Number(paidAmount || 0) > 0) && paidPlusRequested < Number(grand || 0) && avail > 0) {
            const deficit = Math.max(0, Number(grand || 0) - paidPlusRequested)
            const autoToUse = Math.min(avail, Math.max(0, Math.floor(deficit)))
            if (autoToUse > 0) {
              await client.query('UPDATE customers SET loyalty_points = GREATEST(coalesce(loyalty_points,0) - $1, 0) WHERE id = $2', [autoToUse, safeUserId])
              totalLoyaltyUsed += autoToUse
              avail -= autoToUse
            }
          }
          metadataWithLoyalty.loyalty_used = loyaltyUsed
          metadataWithLoyalty.loyalty_available = Number(avail || 0)
          const hasCreditCol = schemaCache.hasColumn('customers', 'credit_due')
          if (hasCreditCol) {
            const paidAmount = (payment_breakdown ? (Number(payment_breakdown.card||0) + Number(payment_breakdown.cash||0) + Number(payment_breakdown.upi||0)) : 0)
            const totalDue = Number(grand || 0) + Number(priorCredit || 0)
            const deficit = Math.max(0, totalDue - (Number(paidAmount || 0) + Number(totalLoyaltyUsed || 0)))
            await client.query('UPDATE customers SET credit_due = $1 WHERE id = $2', [deficit.toFixed(2), safeUserId])
            metadataWithLoyalty.previous_credit = priorCredit
            metadataWithLoyalty.credit_added = deficit
            await client.query('UPDATE sales SET metadata = $1 WHERE id = $2', [metadataWithLoyalty || null, id])
          }
        } catch (e) {
          console.error('Failed updating customer loyalty/credit on edit', e)
        }
      }

      return { status: 200, json: { id } }
    }, { route: 'sales.update' })

    if (result && result.status) {
      // Log modification with before/after snapshots
      try {
        const sres = await db.query('SELECT id, created_at, subtotal, tax_total, grand_total, payment_method, metadata, store_id, user_id FROM sales WHERE id = $1', [id])
        const sit = await db.query('SELECT id, product_id, variant_id, sku, name, qty, price, tax_percent, line_total FROM sale_items WHERE sale_id = $1', [id])
        const saleRow = sres.rows && sres.rows[0] ? sres.rows[0] : null
        const saleItems = sit.rows || []
        const logUserId = req.user && (req.user.sub || req.user.userId || req.user.id) ? (req.user.sub || req.user.userId || req.user.id) : null
        const logUserEmail = req.user && req.user.email ? req.user.email : null
        const logUserName = req.user && (req.user.full_name || req.user.name) ? (req.user.full_name || req.user.name) : null
        const logUserRoles = req.user && req.user.roles ? req.user.roles : null
        const logIp = (req && (req.ip || (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])))) || null
        const actor = { id: logUserId, email: logUserEmail, name: logUserName, roles: logUserRoles, ip: logIp }
        const meta = { action: 'sale.update', module: 'sales', sale_id: id, after: { sale: saleRow, items: saleItems }, actor, userId: logUserId, userEmail: logUserEmail, userName: logUserName }
        logger.info('Sale updated', meta, saleRow && saleRow.store_id || null).catch(()=>{})
      } catch (e) { console.error('Failed logging sale update', e) }
      return res.status(result.status).json(result.json)
    }
    res.status(500).json({ error: 'internal error' })
  } catch (err) {
    console.error('Sale update failed', err)
    res.status(500).json({ error: 'internal error' })
  }
})

// DELETE /api/sales/:id - delete a sale and its items (admin use). Logs before/after.
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' })
  try {
    const s = await db.query('SELECT * FROM sales WHERE id = $1', [id])
    if (s.rows.length === 0) return res.status(404).json({ error: 'not found' })
    const before = s.rows[0]
    const itemsRes = await db.query('SELECT * FROM sale_items WHERE sale_id = $1', [id])
    const beforeItems = itemsRes.rows || []

    // perform delete inside transaction
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM sale_items WHERE sale_id = $1', [id])
      await client.query('DELETE FROM sales WHERE id = $1', [id])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    // Log deletion with before snapshot and after=null
    try {
      const logUserId = req.user && (req.user.sub || req.user.userId || req.user.id) ? (req.user.sub || req.user.userId || req.user.id) : null
      const logUserEmail = req.user && req.user.email ? req.user.email : null
      const logUserName = req.user && (req.user.full_name || req.user.name) ? (req.user.full_name || req.user.name) : null
      const logUserRoles = req.user && req.user.roles ? req.user.roles : null
      const logIp = (req && (req.ip || (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])))) || null
      const actor = { id: logUserId, email: logUserEmail, name: logUserName, roles: logUserRoles, ip: logIp }
      const meta = { action: 'sale.delete', module: 'sales', sale_id: id, before: { sale: before, items: beforeItems }, after: null, actor, userId: logUserId, userEmail: logUserEmail, userName: logUserName }
      logger.info('Sale deleted', meta, req.user && req.user.store_id || null).catch(()=>{})
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error('Failed to delete sale', e)
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router;

// Add list and detail endpoints
// GET /api/sales - optional query: from, to (YYYY-MM-DD), payment_method
router.get('/', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json([])
  const { from, to, payment_method } = req.query
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
    if (payment_method) { params.push(payment_method); clauses.push(`s.payment_method = $${params.length}`) }
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
    const hasVariantCol = schemaCache.hasColumn('sale_items', 'variant_id')
    const hasIsDiscounted = schemaCache.hasColumn('sale_items', 'is_discounted')
  // build columns selecting from sale_items (alias si) and coalesce mrp from sale_items -> products -> products.price
  const baseCols = 'si.id, si.product_id' + (hasVariantCol ? ', si.variant_id' : '') + ', si.sku, si.name, si.qty, si.price, si.tax_percent, si.line_total' + (hasIsDiscounted ? ', si.is_discounted' : '')
  const hasMrpCol = schemaCache.hasColumn('sale_items', 'mrp')
  // only reference si.mrp when the column exists; otherwise fall back to product values
  const mrpExpr = hasMrpCol ? ', COALESCE(si.mrp, p.mrp, p.price) AS mrp' : ', COALESCE(p.mrp, p.price) AS mrp'
    if (hasStoreCol && hasStore) {
      items = await db.query(`SELECT ${baseCols}${mrpExpr} FROM sale_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id=$1 AND si.store_id=$2`, [id, req.user.store_id])
    } else {
      items = await db.query(`SELECT ${baseCols}${mrpExpr} FROM sale_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id=$1`, [id])
    }
  } catch (e) {
    // fallback: best-effort to return items
    const fallbackCols = 'id, product_id, sku, name, qty, price, tax_percent, line_total'
    items = await db.query(`SELECT ${fallbackCols} FROM sale_items WHERE sale_id=$1`, [id])
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
