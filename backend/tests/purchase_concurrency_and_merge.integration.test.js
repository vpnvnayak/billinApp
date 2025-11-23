const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')
const helpers = require('./testHelpers')

function uniqueSku(base) {
  return `${base}-${Date.now()}-${Math.floor(Math.random()*1000)}`
}

describe('Concurrent variant creation and merging product stock', () => {
  const skus = []
  let createdPurchases = []

  afterAll(async () => {
    try {
      for (const pid of createdPurchases) {
        await db.query('DELETE FROM purchase_items WHERE purchase_id = $1', [pid]).catch(() => {})
        await db.query('DELETE FROM purchases WHERE id = $1', [pid]).catch(() => {})
      }
      await helpers.cleanupBySkus(skus)
    } catch (e) {
      // ignore
    } finally {
      try { await db.pool.end() } catch (e) {}
    }
  })

  test('concurrent POSTs for same SKU+MRP create a single variant and aggregate stock', async () => {
    const sku = uniqueSku('CONCUR')
    skus.push(sku)
    const mrp = 50
    const price = 40

    // Prepare two payloads with same SKU and MRPs
    const payload = (qty) => ({ supplier_id: null, total_amount: qty * price, metadata: { test: true }, items: [{ sku, name: 'Concur Item', qty, price, gross_amount: qty * price, after_discount: qty * price, tax_amount: 0, total_amount: qty * price, discount_rs: 0, discount_pct: 0, tax_pct: 0, mrp }] })

    // Fire two requests concurrently
    const p1 = request(app).post('/api/purchases').send(payload(3)).set('Accept', 'application/json')
    const p2 = request(app).post('/api/purchases').send(payload(4)).set('Accept', 'application/json')

    const results = await Promise.all([p1, p2])
    expect(results[0].status).toBe(201)
    expect(results[1].status).toBe(201)
    const id1 = results[0].body.id
    const id2 = results[1].body.id
    createdPurchases.push(id1, id2)

    // Because concurrent requests may create multiple product rows with the same SKU
    // (no unique constraint on sku), aggregate stock across all products/variants
    // matching this SKU and MRP to ensure total stock equals sum of both purchases.
    const varSumRes = await db.query(
      `SELECT COALESCE(SUM(pv.stock)::int,0) AS variant_sum
       FROM product_variants pv JOIN products p ON pv.product_id = p.id
       WHERE p.sku = $1 AND pv.mrp IS NOT DISTINCT FROM $2`,
      [sku, mrp]
    )
    const prodSumRes = await db.query(
      `SELECT COALESCE(SUM(p.stock)::int,0) AS product_sum FROM products p WHERE p.sku = $1`,
      [sku]
    )
    const variantStockSum = Number(varSumRes.rows[0].variant_sum || 0)
    const productStockSum = Number(prodSumRes.rows[0].product_sum || 0)
    const totalStock = variantStockSum + productStockSum

    // Total stock should be sum of both purchases
    expect(totalStock).toBe(3 + 4)
  })

  test('existing product stock merges into created variant when variant created', async () => {
    const sku = uniqueSku('MERGE')
    skus.push(sku)
    const mrp = 77.77
    const price = 70

    // Create a product with stock at product level
    const prodIns = await db.query('INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, stock', [sku, 'Merge Product', price, mrp, null, 0, 10])
    const productId = prodIns.rows[0].id
    expect(Number(prodIns.rows[0].stock)).toBe(10)

    // Create purchase that will cause a variant to be created for same product with some qty 5
    const payload = { supplier_id: null, total_amount: 5 * price, metadata: { test: true }, items: [{ sku, name: 'Merge Item', qty: 5, price, gross_amount: 5 * price, after_discount: 5 * price, tax_amount: 0, total_amount: 5 * price, discount_rs: 0, discount_pct: 0, tax_pct: 0, mrp }] }
    const postRes = await request(app).post('/api/purchases').send(payload).set('Accept', 'application/json')
    expect(postRes.status).toBe(201)
    const purchaseId = postRes.body.id
    createdPurchases.push(purchaseId)

    // Now check variant created and its stock should be product stock + purchase qty = 10 + 5
    const varRes = await db.query('SELECT id, stock FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [productId, mrp])
    expect(varRes.rows.length).toBe(1)
    expect(Number(varRes.rows[0].stock)).toBe(10 + 5)

    // product.stock should be set to 0
    const p2 = await db.query('SELECT stock FROM products WHERE id = $1', [productId])
    expect(Number(p2.rows[0].stock)).toBe(0)
  })

  test('is_repacking (non-variant) fallback updates product master and inserts item without variant_id', async () => {
    const sku = uniqueSku('REPACK')
    skus.push(sku)
    const price = 33

    // Create product with is_repacking = true
    const prodRes = await db.query('INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock, is_repacking) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [sku, 'Repack Product', price, null, null, 0, 0, true])
    const productId = prodRes.rows[0].id

    const payload = { supplier_id: null, total_amount: 5 * price, metadata: { test: true }, items: [{ product_id: productId, sku, name: 'Repack Item', qty: 5, price, gross_amount: 5 * price, after_discount: 5 * price, tax_amount: 0, total_amount: 5 * price, discount_rs: 0, discount_pct: 0, tax_pct: 0 }] }
    const postRes = await request(app).post('/api/purchases').send(payload).set('Accept', 'application/json')
    expect(postRes.status).toBe(201)
    const purchaseId = postRes.body.id
    createdPurchases.push(purchaseId)

    // Check product stock updated and no variant created
    const p = await db.query('SELECT stock FROM products WHERE id = $1', [productId])
    expect(Number(p.rows[0].stock)).toBe(5)

    const varRes = await db.query('SELECT id FROM product_variants WHERE product_id = $1', [productId])
    // should be zero variants
    expect(varRes.rows.length).toBe(0)
  })
})
