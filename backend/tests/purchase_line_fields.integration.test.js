const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

describe('Purchase per-line fields persistence', () => {
  let createdId = null

  afterAll(async () => {
    try {
      if (createdId) {
        await db.query('DELETE FROM purchase_items WHERE purchase_id = $1', [createdId])
        await db.query('DELETE FROM purchases WHERE id = $1', [createdId])
      }
    } catch (e) {
      // ignore cleanup errors
    } finally {
      try { await db.pool.end() } catch (e) {}
    }
  })

  test('POST then GET preserves after_discount, tax_amount, total_amount, discount_pct, discount_rs', async () => {
    const payload = {
      supplier_id: null,
      total_amount: 19.8,
      metadata: { test: true, tag: 'integration-test' },
      items: [
        {
          name: 'INT Test Item',
          qty: 2,
          price: 10,
          unit_price: 10,
          gross_amount: 20,
          after_discount: 18,
          tax_amount: 1.8,
          total_amount: 19.8,
          discount_rs: 2,
          discount_pct: 10,
          tax_pct: 9
        }
      ]
    }

    const postRes = await request(app).post('/api/purchases').send(payload).set('Accept', 'application/json')
    expect(postRes.status).toBe(201)
    expect(postRes.body).toHaveProperty('id')
    createdId = postRes.body.id

    const getRes = await request(app).get(`/api/purchases/${createdId}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body).toHaveProperty('items')
    expect(Array.isArray(getRes.body.items)).toBe(true)
    expect(getRes.body.items.length).toBeGreaterThan(0)

    const it = getRes.body.items[0]
    // Numeric values are returned as strings by pg for NUMERIC types, so coerce
    expect(Number(it.after_discount)).toBeCloseTo(18.0, 2)
    expect(Number(it.tax_amount)).toBeCloseTo(1.8, 2)
    expect(Number(it.total_amount)).toBeCloseTo(19.8, 2)
    expect(Number(it.discount_pct)).toBeCloseTo(10.0, 2)
    expect(Number(it.discount_rs)).toBeCloseTo(2.0, 2)
  })
})
