const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(15000)

test('cannot unset is_repacking once created true (returns 400)', async () => {
  const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`
  const sku = `REPK-UNSET-${uniq()}`
  const createPayload = { name: 'Repack Unset Test', sku, price: 9.5, stock: 2, is_repacking: true }

  // create product
  const createRes = await request(app).post('/api/products').send(createPayload)
  expect(createRes.status).toBe(201)
  expect(createRes.body).toBeDefined()
  const pid = createRes.body && createRes.body.id
  expect(pid).toBeTruthy()

  try {
    // attempt to unset is_repacking via PUT
    const updatePayload = { name: 'Repack Unset Test Updated', sku, price: 10.0, stock: 5, is_repacking: false }
    const upRes = await request(app).put(`/api/products/${pid}`).send(updatePayload)
    expect(upRes.status).toBe(400)
    expect(upRes.body).toBeDefined()
    expect(upRes.body.error).toMatch(/is_repacking cannot be unset/i)
  } finally {
    // cleanup regardless of assertion outcome
    try { if (pid) await db.query('DELETE FROM product_variants WHERE product_id = $1', [pid]) } catch (e) {}
    try { if (pid) await db.query('DELETE FROM products WHERE id = $1', [pid]) } catch (e) {}
  }
})
