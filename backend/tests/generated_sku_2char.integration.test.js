const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

describe('POST /api/products auto-generated 2-char SKU (2 letters + 6 digits)', () => {
  afterAll(async () => {
    try { await db.pool.end() } catch (e) {}
  })

  it('happy path: store named MyStore produces SKU starting with MY', async () => {
    const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`
    const storeEmail = `store+${uniq()}@local`
    const storePass = 'StoreTest1!'
    const storeUsername = `u-${uniq()}`
    const storeName = 'MyStore'

    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: storeUsername, email: storeEmail, password: storePass })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId

    const login = await request(app).post('/api/auth/login').send({ email: storeEmail, password: storePass })
    expect(login.status).toBe(200)
    const token = login.body.token

    const payload = { name: 'AutoSKU MyStore', price: 12.5, stock: 3 }
    const res = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send(payload).expect(201)
    expect(res.body).toBeTruthy()
    expect(res.body.sku).toBeTruthy()
    const sku = res.body.sku
    // 2 letters (A-Z) followed by 6 digits
    expect(/^[A-Z]{2}\d{6}$/.test(sku)).toBe(true)
    expect(sku.startsWith('MY')).toBe(true)

    // cleanup
    await db.query('DELETE FROM products WHERE id = $1', [res.body.id])
    await db.query('DELETE FROM users WHERE id = $1', [reg.body.userId])
    await db.query('DELETE FROM stores WHERE id = $1', [storeId])
  })

  it('collision simulation: pre-insert colliding SKU and ensure generation retries', async () => {
    const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`
    const storeEmail = `storec+${uniq()}@local`
    const storePass = 'StoreTest2!'
    const storeUsername = `uc-${uniq()}`
    const storeName = `CollideStore ${uniq()}`

    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: storeUsername, email: storeEmail, password: storePass })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId

    const login = await request(app).post('/api/auth/login').send({ email: storeEmail, password: storePass })
    expect(login.status).toBe(200)
    const token = login.body.token

    // compute prefix: letters-only first 2 chars uppercased
    const lettersOnly = storeName.replace(/[^A-Za-z]/g, '')
    const prefix = (lettersOnly.length >= 2 ? lettersOnly.slice(0,2) : (lettersOnly[0] || 'S') + 'X').toUpperCase()

    // Prime Math.random in server by overriding it in this process so generated candidates are deterministic
    const seq = [0.123456, 0.789012]
    const origRandom = Math.random
    Math.random = () => (seq.length ? seq.shift() : 0.999999)

    try {
      const firstRand = Math.floor(0.123456 * 1000000).toString().padStart(6, '0')
      const firstCandidate = `${prefix}${firstRand}`
      // pre-insert a colliding product in same store
      const ins = await db.query('INSERT INTO products (sku, name, price, stock, store_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [firstCandidate, 'PreCollide', 1, 1, storeId])
      const collidingId = ins.rows[0].id

      // create product via API; server should skip the colliding candidate and pick next
      const payload = { name: 'RetrySKU', price: 5.5, stock: 2 }
      const res = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send(payload).expect(201)
      expect(res.body).toBeTruthy()
      expect(res.body.sku).toBeTruthy()
      expect(res.body.sku).not.toBe(firstCandidate)
      expect(res.body.sku.startsWith(prefix)).toBe(true)
      expect(/^[A-Z]{2}\d{6}$/.test(res.body.sku)).toBe(true)

      // cleanup
      await db.query('DELETE FROM products WHERE id = $1 OR id = $2', [res.body.id, collidingId])
      await db.query('DELETE FROM users WHERE id = $1', [reg.body.userId])
      await db.query('DELETE FROM stores WHERE id = $1', [storeId])
    } finally {
      Math.random = origRandom
    }
  })
})
