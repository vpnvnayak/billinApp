const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(30000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

describe('POS integration (real DB)', () => {
  const created = { users: [], stores: [], products: [] }

  afterAll(async () => {
    try {
      if (created.products.length) await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [created.products])
      if (created.stores.length) await db.query('DELETE FROM stores WHERE id = ANY($1::int[])', [created.stores])
      if (created.users.length) await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [created.users])
    } catch (e) {
      console.warn('pos integration teardown failed', e && e.message)
    }
    try { await db.pool.end() } catch (e) {}
  })

  test('store product visible via /api/pos/products for storeadmin', async () => {
    const storeEmail = `pos-${uniq()}@local`
    const storePass = 'PosTest123!'
    const storeUsername = `pos-${uniq()}`
    const storeName = `POS Store ${uniq()}`

    // register store
    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: storeUsername, email: storeEmail, password: storePass })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId
    const userId = reg.body.userId
    created.stores.push(storeId)
    created.users.push(userId)

    // login
    const login = await request(app).post('/api/auth/login').send({ email: storeEmail, password: storePass })
    expect(login.status).toBe(200)
    const token = login.body.token
    expect(token).toBeTruthy()

    // create a product under this store
    const sku = `POS-INT-${uniq()}`
    const create = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send({ name: 'POS Integration Item', sku, price: 25.5, stock: 10 })
    expect(create.status).toBe(201)
    const prodId = create.body.id
    created.products.push(prodId)

    // now query /api/pos/products for the SKU
    const res = await request(app).get('/api/pos/products').set('Authorization', `Bearer ${token}`).query({ query: sku, limit: 10 })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // ensure the created product is present in the results
    const found = (res.body || []).some(r => Number(r.id) === Number(prodId) || (r.sku && r.sku === sku))
    expect(found).toBe(true)
  })
})
