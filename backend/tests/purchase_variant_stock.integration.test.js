const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')
const helpers = require('./testHelpers')

function uniqueSku(base) {
  return `${base}-${Date.now()}-${Math.floor(Math.random()*1000)}`
}

describe('Variant creation and stock updates', () => {
  const skus = []
  let purchaseId = null
  let productId = null
  let variantId = null

  afterAll(async () => {
    try {
      if (purchaseId) {
        await db.query('DELETE FROM purchase_items WHERE purchase_id = $1', [purchaseId]).catch(() => {})
        await db.query('DELETE FROM purchases WHERE id = $1', [purchaseId]).catch(() => {})
      }
      // cleanup products and variants by SKU
      await helpers.cleanupBySkus(skus)
    } catch (e) {
      // ignore
    } finally {
      try { await db.pool.end() } catch (e) {}
    }
  })

  test('creating purchase creates variant and sets stock; updating purchase rolls back and applies new stock', async () => {
    const sku = uniqueSku('INT-VAR')
    skus.push(sku)
    const mrp = 123.45
    const price = 100
    const initialQty = 5
    const updatedQty = 2

    // POST purchase creating variant
    const payload = {
      supplier_id: null,
      total_amount: (initialQty * price),
      metadata: { test: true, tag: 'variant-stock' },
      items: [
        {
          sku,
          name: 'Variant Stock Item',
          qty: initialQty,
          price,
          gross_amount: initialQty * price,
          after_discount: initialQty * price,
          tax_amount: 0,
          total_amount: initialQty * price,
          discount_rs: 0,
          discount_pct: 0,
          tax_pct: 0,
          mrp
        }
      ]
    }

    const postRes = await request(app).post('/api/purchases').send(payload).set('Accept', 'application/json')
    expect(postRes.status).toBe(201)
    purchaseId = postRes.body.id

    // find created product by SKU
    const prodRes = await db.query('SELECT id FROM products WHERE sku = $1', [sku])
    expect(prodRes.rows.length).toBeGreaterThan(0)
    productId = prodRes.rows[0].id

    // find variant with given mrp
    const varRes = await db.query('SELECT id, stock, mrp FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [productId, mrp])
    expect(varRes.rows.length).toBeGreaterThan(0)
    variantId = varRes.rows[0].id
    expect(Number(varRes.rows[0].stock)).toBe(initialQty)

    // Now update the purchase: change qty to updatedQty
    const getRes = await request(app).get(`/api/purchases/${purchaseId}`)
    expect(getRes.status).toBe(200)
    const items = getRes.body.items
    expect(items.length).toBeGreaterThan(0)

    // modify the line quantity
    const modifiedItems = items.map(it => ({ ...it, qty: updatedQty }))
    const putPayload = { supplier_id: null, total_amount: updatedQty * price, metadata: { updated: true }, items: modifiedItems }
    const putRes = await request(app).put(`/api/purchases/${purchaseId}`).send(putPayload).set('Accept', 'application/json')
    expect([200,201]).toContain(putRes.status)

    // query variant stock again, should reflect updatedQty (old qty was subtracted, then new qty added)
    const varRes2 = await db.query('SELECT id, stock FROM product_variants WHERE id = $1', [variantId])
    expect(varRes2.rows.length).toBe(1)
    expect(Number(varRes2.rows[0].stock)).toBe(updatedQty)
  })
})
