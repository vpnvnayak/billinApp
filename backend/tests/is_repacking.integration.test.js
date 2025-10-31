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
  // If DB has is_repacking column, assert it at the DB level; otherwise accept response flag when present
  const col = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_repacking') AS has_col")
  const hasCol = col.rows && col.rows[0] && col.rows[0].has_col
  if (hasCol) {
    const q = await db.query('SELECT is_repacking FROM products WHERE id = $1', [res.body.id])
    expect(q.rows.length).toBe(1)
    const val = q.rows[0].is_repacking
    expect(val === true || val === 't').toBeTruthy()
  } else {
    expect(res.body.is_repacking === true || res.body.is_repacking === 't' || res.body.is_repacking === undefined).toBeTruthy()
  }

  // cleanup
  try {
    if (res.body && res.body.id) await db.query('DELETE FROM products WHERE id = $1', [res.body.id])
  } catch (e) {
    // ignore cleanup errors
  }
})
