const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(15000)

test('create product with is_repacking=true returns the flag', async () => {
  const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`
  const sku = `REPK-${uniq()}`
  const payload = { name: 'Repack Test', sku, price: 12.5, stock: 3, is_repacking: true }

  const res = await request(app).post('/api/products').send(payload)
  expect(res.status).toBe(201)
  expect(res.body).toBeDefined()
  expect(res.body.id).toBeTruthy()
  expect(res.body.is_repacking === true || res.body.is_repacking === 't').toBeTruthy()

  // cleanup
  try {
    if (res.body && res.body.id) await db.query('DELETE FROM products WHERE id = $1', [res.body.id])
  } catch (e) {
    // ignore cleanup errors
  }
})
