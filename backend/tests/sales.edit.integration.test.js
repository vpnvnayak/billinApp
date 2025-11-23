const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(40000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

describe('Sales edit integration', () => {
  const created = { users: [], stores: [], products: [] }

  afterAll(async () => {
    try {
      if (created.products.length) await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [created.products])
      if (created.stores.length) await db.query('DELETE FROM stores WHERE id = ANY($1::int[])', [created.stores])
      if (created.users.length) await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [created.users])
    } catch (e) {
      console.warn('teardown failed', e && e.message)
    }
    try { await db.pool.end() } catch (e) {}
  })

  test('create sale then edit replaces items and reconciles stock', async () => {
    // register store
    const storeEmail = `sales-edit-${uniq()}@local`
    const storePass = 'Test123!'
    const storeUsername = `sales-edit-${uniq()}`
    const storeName = `Sales Edit ${uniq()}`

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

    // create two products
    const skuA = `A-${uniq()}`
    const createA = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send({ name: 'Item A', sku: skuA, price: 10, stock: 10 })
    expect(createA.status).toBe(201)
    const prodA = createA.body.id
    created.products.push(prodA)

    const skuB = `B-${uniq()}`
    const createB = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send({ name: 'Item B', sku: skuB, price: 20, stock: 5 })
    expect(createB.status).toBe(201)
    const prodB = createB.body.id
    created.products.push(prodB)

    // create sale with A x2 and B x1
    const salePayload = {
      items: [
        { product_id: prodA, qty: 2, price: 10, tax_percent: 0 },
        { product_id: prodB, qty: 1, price: 20, tax_percent: 0 }
      ],
      payment_method: 'cash',
      payment_breakdown: { cash: 40 }
    }

    const createSale = await request(app).post('/api/sales').set('Authorization', `Bearer ${token}`).send(salePayload)
    expect(createSale.status).toBe(201)
    const saleId = createSale.body.id
    expect(saleId).toBeTruthy()

    // check stocks after creation
    const pa = await db.query('SELECT stock FROM products WHERE id = $1', [prodA])
    const pb = await db.query('SELECT stock FROM products WHERE id = $1', [prodB])
    expect(Number(pa.rows[0].stock)).toBe(8) // 10 - 2
    expect(Number(pb.rows[0].stock)).toBe(4) // 5 - 1

    // now edit sale: replace with only A x1
    const editPayload = { items: [ { product_id: prodA, qty: 1, price: 10, tax_percent: 0 } ], payment_method: 'cash', metadata: { edited: true } }
    const edit = await request(app).put(`/api/sales/${saleId}`).set('Authorization', `Bearer ${token}`).send(editPayload)
    expect(edit.status === 200 || edit.status === 201).toBeTruthy()

    // verify sale items now only include 1 line for A
    const after = await request(app).get(`/api/sales/${saleId}`).set('Authorization', `Bearer ${token}`)
    expect(after.status).toBe(200)
    const items = after.body.items || []
    expect(items.length).toBe(1)
    expect(Number(items[0].product_id)).toBe(prodA)
    expect(Number(items[0].qty)).toBe(1)

    // verify stocks reconciled: A should be 9 (restored 2 -> 10 then consumed 1), B restored to 5
    const pa2 = await db.query('SELECT stock FROM products WHERE id = $1', [prodA])
    const pb2 = await db.query('SELECT stock FROM products WHERE id = $1', [prodB])
    expect(Number(pa2.rows[0].stock)).toBe(9)
    expect(Number(pb2.rows[0].stock)).toBe(5)
  })
})
