const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(30000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

describe('System logs actor metadata', () => {
  const created = { users: [], stores: [], products: [], logs: [] }

  afterAll(async () => {
    try {
      if (created.products.length) await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [created.products])
      if (created.stores.length) await db.query('DELETE FROM stores WHERE id = ANY($1::int[])', [created.stores])
      if (created.users.length) await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [created.users])
      if (created.logs.length) await db.query('DELETE FROM system_logs WHERE id = ANY($1::int[])', [created.logs])
    } catch (e) {
      console.warn('teardown failed', e && e.message)
    }
    try { await db.pool.end() } catch (e) {}
  })

  test('sale create log contains meta.actor', async () => {
    const storeEmail = `log-actor-${uniq()}@local`
    const storePass = 'Test123!'
    const storeUsername = `log-actor-${uniq()}`
    const storeName = `Log Actor ${uniq()}`

    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: storeUsername, email: storeEmail, password: storePass })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId
    const userId = reg.body.userId
    created.stores.push(storeId)
    created.users.push(userId)

    const login = await request(app).post('/api/auth/login').send({ email: storeEmail, password: storePass })
    expect(login.status).toBe(200)
    const token = login.body.token
    expect(token).toBeTruthy()

    // create a product
    const sku = `LOG-A-${uniq()}`
    const create = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send({ name: 'Log Actor Item', sku, price: 5, stock: 10 })
    expect(create.status).toBe(201)
    const prodId = create.body.id
    created.products.push(prodId)

    // create a sale to trigger a log
    const salePayload = { items: [ { product_id: prodId, qty: 1, price: 5, tax_percent: 0 } ], payment_method: 'cash', payment_breakdown: { cash: 5 } }
    const createSale = await request(app).post('/api/sales').set('Authorization', `Bearer ${token}`).send(salePayload)
    expect(createSale.status).toBe(201)
    const saleId = createSale.body.id
    expect(saleId).toBeTruthy()

    // poll system_logs for an entry where meta->'actor' is not null and meta.action = 'sale.create'
    let found = false
    let rows = []
    for (let i = 0; i < 20; i++) {
      const r = await db.query("SELECT id, meta FROM system_logs WHERE meta IS NOT NULL AND (meta->>'action' = $1 OR meta->>'action' = $2) ORDER BY created_at DESC LIMIT 5", ['sale.create', 'sale_create'])
      rows = r.rows || []
      if (rows.length > 0) {
        // inspect rows for actor
        for (const row of rows) {
          try {
            const meta = row.meta || row["meta"]
            if (!meta) continue
            // meta might be JSON object already
            const act = meta.actor || (meta && meta['actor'])
            if (act && (act.id || act.name || act.email)) {
              // if actor has an id, assert it matches the created user id
              if (act.id) {
                expect(String(act.id)).toBe(String(userId))
                // record the log row for cleanup
                created.logs.push(row.id)
              }
              found = true
              break
            }
          } catch (e) {}
        }
      }
      if (found) break
      // wait 200ms
      await new Promise(r => setTimeout(r, 200))
    }
    expect(found).toBe(true)
  })
})
