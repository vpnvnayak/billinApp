const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

// This test creates a product with a limited stock and then fires many concurrent
// sale requests that each attempt to purchase 1 unit. The backend uses SELECT ... FOR UPDATE
// when decrementing stock; this test asserts that total quantity sold never exceeds initial stock.

describe('concurrent sales oversell protection', () => {
  const sku = `TEST-P-${Date.now()}`
  const initialStock = 5
  let productId = null

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    // create product
    const r = await db.query('INSERT INTO products (name, sku, price, stock) VALUES ($1,$2,$3,$4) RETURNING id', ["Concurrency Test Product", sku, 10.0, initialStock])
    productId = r.rows[0].id
  })

  afterAll(async () => {
    if (!process.env.DATABASE_URL) return
    try {
      await db.query('DELETE FROM sale_items WHERE product_id = $1', [productId])
      await db.query('DELETE FROM sales WHERE id NOT IN (SELECT DISTINCT sale_id FROM sale_items)')
      await db.query('DELETE FROM products WHERE id = $1', [productId])
    } catch (e) { console.warn('cleanup failed', e && e.message) }
    await db.pool.end()
  })

  test('concurrent requests do not oversell', async () => {
    if (!process.env.DATABASE_URL) return
    const concurrent = 10
    // build sale request body: one item qty=1 for productId
    const saleBody = { items: [{ product_id: productId, qty: 1, price: 10.0 }] }

    // fire concurrent requests
    const promises = []
    for (let i = 0; i < concurrent; i++) {
      promises.push(request(app).post('/api/sales').send(saleBody).set('Accept', 'application/json'))
    }

    const results = await Promise.all(promises)
    // count successful sales (201)
    const success = results.filter(r => r.status === 201)
    const failed = results.filter(r => r.status !== 201)

  // debug logging removed: rely on assertions for test results

    // total successes should be <= initialStock
    expect(success.length).toBeLessThanOrEqual(initialStock)

    // check remaining stock in DB
    const pr = await db.query('SELECT stock FROM products WHERE id = $1', [productId])
    const remaining = pr.rows.length ? Number(pr.rows[0].stock || 0) : 0
    expect(remaining).toBeGreaterThanOrEqual(0)
    expect(remaining + success.length).toBe(initialStock)
  }, 20000)
})
