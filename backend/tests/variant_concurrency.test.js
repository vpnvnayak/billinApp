const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(30000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('concurrent purchases creating same variant should not create duplicate variants', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `CVAR-${uniq()}`

  // create product master with some initial stock to verify stock migration handling
  const p = await request(app).post('/api/products').send({ name: 'CVariant', sku, price: 100, mrp: 100, stock: 5 })
  expect(p.status).toBe(201)
  const productId = p.body.id

  // Prepare N concurrent purchases that request creating variant with mrp 120
  const concurrent = 6
  const qtyPer = 2
  const mrp = 120

  const payload = { supplier_id: null, total_amount: concurrent * qtyPer * mrp, items: [{ product_id: productId, sku, name: 'CVariant', qty: qtyPer, price: mrp, mrp, line_total: qtyPer * mrp }] }

  // Fire concurrent requests
  const promises = []
  for (let i = 0; i < concurrent; i++) {
    promises.push(request(app).post('/api/purchases').send(payload))
  }

  const results = await Promise.all(promises)
  // all should be 201
  for (const r of results) {
    expect(r.status).toBe(201)
  }

  // Now query product_variants for this product and mrp
  const pv = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [productId, mrp])
  expect(pv.rows.length).toBe(1) // only one variant row
  const variant = pv.rows[0]

  // Expected stock: initial product stock (5) + concurrent * qtyPer
  const expected = 5 + (concurrent * qtyPer)
  expect(Number(variant.stock)).toBeGreaterThanOrEqual(expected)

  // cleanup
  const helpers = require('./testHelpers')
  await helpers.cleanupByProductId(productId)
})
