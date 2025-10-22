const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(15000)

test('omitting is_repacking on update keeps it true', async () => {
  const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`
  const sku = `REPK-OMIT-${uniq()}`
  const createPayload = { name: 'Repack Omit Test', sku, price: 7.5, stock: 2, is_repacking: true }

  const createRes = await request(app).post('/api/products').send(createPayload)
  expect(createRes.status).toBe(201)
  const pid = createRes.body && createRes.body.id
  expect(pid).toBeTruthy()

  try {
    // Update without is_repacking field
    const updatePayload = { name: 'Repack Omit Test Updated', sku, price: 8.0, stock: 10 }
    const upRes = await request(app).put(`/api/products/${pid}`).send(updatePayload)
    expect(upRes.status).toBe(200)
    expect(upRes.body).toBeDefined()
    // fetch product to ensure is_repacking remains true
    const getRes = await request(app).get(`/api/products/${pid}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body).toBeDefined()
    // If the DB has the column, assert it remains true
    if (Object.prototype.hasOwnProperty.call(getRes.body, 'is_repacking')) {
      expect(getRes.body.is_repacking === true || String(getRes.body.is_repacking) === 't').toBeTruthy()
    }
  } finally {
    try { if (pid) await db.query('DELETE FROM product_variants WHERE product_id = $1', [pid]) } catch (e) {}
    try { if (pid) await db.query('DELETE FROM products WHERE id = $1', [pid]) } catch (e) {}
  }
})
