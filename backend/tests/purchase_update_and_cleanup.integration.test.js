const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')
const helpers = require('./testHelpers')

function uniqueSku(base) {
  return `${base}-${Date.now()}-${Math.floor(Math.random()*1000)}`
}

describe('Purchase multiple items, update flow, and cleanup', () => {
  const skus = []
  let purchaseId = null

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

  test('create purchase with multiple items and preserve per-line fields', async () => {
    const sku1 = uniqueSku('INT-MULTI-1')
    const sku2 = uniqueSku('INT-MULTI-2')
    skus.push(sku1, sku2)

    const payload = {
      supplier_id: null,
      total_amount: 39.6,
      metadata: { test: true, tag: 'multi-items' },
      items: [
        {
          sku: sku1,
          name: 'Multi Item 1',
          qty: 2,
          price: 10,
          gross_amount: 20,
          after_discount: 18,
          tax_amount: 1.8,
          total_amount: 19.8,
          discount_rs: 2,
          discount_pct: 10,
          tax_pct: 9
        },
        {
          sku: sku2,
          name: 'Multi Item 2',
          qty: 1,
          price: 20,
          gross_amount: 20,
          after_discount: 19,
          tax_amount: 0.95,
          total_amount: 19.95,
          discount_rs: 1,
          discount_pct: 5,
          tax_pct: 5
        }
      ]
    }

    const postRes = await request(app).post('/api/purchases').send(payload).set('Accept', 'application/json')
    expect(postRes.status).toBe(201)
    expect(postRes.body).toHaveProperty('id')
    purchaseId = postRes.body.id

    const getRes = await request(app).get(`/api/purchases/${purchaseId}`)
    expect(getRes.status).toBe(200)
    expect(Array.isArray(getRes.body.items)).toBe(true)
    expect(getRes.body.items.length).toBe(2)

    const it1 = getRes.body.items.find(i => i.sku === sku1)
    const it2 = getRes.body.items.find(i => i.sku === sku2)
    expect(it1).toBeTruthy()
    expect(it2).toBeTruthy()

    expect(Number(it1.after_discount)).toBeCloseTo(18, 2)
    expect(Number(it1.tax_amount)).toBeCloseTo(1.8, 2)
    expect(Number(it1.total_amount)).toBeCloseTo(19.8, 2)
    expect(Number(it1.discount_pct)).toBeCloseTo(10, 2)
    expect(Number(it1.discount_rs)).toBeCloseTo(2, 2)

    expect(Number(it2.after_discount)).toBeCloseTo(19, 2)
    expect(Number(it2.tax_amount)).toBeCloseTo(0.95, 2)
    expect(Number(it2.total_amount)).toBeCloseTo(19.95, 2)
    expect(Number(it2.discount_pct)).toBeCloseTo(5, 2)
    expect(Number(it2.discount_rs)).toBeCloseTo(1, 2)
  })

  test('update purchase (PUT) modifies line fields and persists', async () => {
    // require purchaseId
    expect(purchaseId).toBeTruthy()

    // get current items
    const g = await request(app).get(`/api/purchases/${purchaseId}`)
    expect(g.status).toBe(200)
    const items = g.body.items
    expect(items.length).toBe(2)

    // modify first item (change discount and tax)
    const modifiedItems = items.map(it => {
      if (it.sku && it.sku.startsWith('INT-MULTI-1')) {
        return { ...it, after_discount: '16.00', tax_amount: '1.6', total_amount: '17.6', discount_pct: '20.00', discount_rs: '4.00' }
      }
      return it
    })

    const payload = { supplier_id: null, total_amount: 37.55, metadata: { updated: true }, items: modifiedItems }
    const putRes = await request(app).put(`/api/purchases/${purchaseId}`).send(payload).set('Accept', 'application/json')
    expect([200,201]).toContain(putRes.status)

    const g2 = await request(app).get(`/api/purchases/${purchaseId}`)
    expect(g2.status).toBe(200)
    const it1 = g2.body.items.find(i => i.sku && i.sku.startsWith('INT-MULTI-1'))
    expect(Number(it1.after_discount)).toBeCloseTo(16.00, 2)
    expect(Number(it1.tax_amount)).toBeCloseTo(1.6, 2)
    expect(Number(it1.total_amount)).toBeCloseTo(17.6, 2)
    expect(Number(it1.discount_pct)).toBeCloseTo(20, 2)
    expect(Number(it1.discount_rs)).toBeCloseTo(4, 2)
  })
})
