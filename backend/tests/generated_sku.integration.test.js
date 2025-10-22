const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

describe('POST /api/products auto-generated SKU', () => {
  afterAll(async () => {
    try { await db.pool.end() } catch (e) {}
  })

  it('should generate a sku when none provided and persist it', async () => {
    // create a sample product without sku
    const payload = { name: 'Auto SKU Test', price: 10.5, mrp: 12.0, unit: 'Nos', stock: 5, tax_percent: 0 }
    const res = await request(app).post('/api/products').send(payload).expect(201)
    expect(res.body).toBeTruthy()
    expect(res.body.id).toBeTruthy()
    expect(res.body.sku).toBeTruthy()
    // sku should be 3 letters followed by 5 digits
    const sku = res.body.sku
    expect(/^[A-Z]{3}\d{5}$/.test(sku)).toBe(true)

    // verify DB has the product with same sku
    const q = await db.query('SELECT id, sku FROM products WHERE id = $1', [res.body.id])
    expect(q.rows.length).toBe(1)
    expect(q.rows[0].sku).toBe(sku)

    // cleanup
    await db.query('DELETE FROM products WHERE id = $1', [res.body.id])
  })

  it('should use store prefix when creating a product for a store', async () => {
    // register a store and login to obtain token
    const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`
    const storeEmail = `store+${uniq()}@local`
    const storePass = 'Store123!'
    const storeUsername = `s-${uniq()}`
    const storeName = `PrefStore ${uniq()}`
    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: storeUsername, email: storeEmail, password: storePass })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId

    // login
    const login = await request(app).post('/api/auth/login').send({ email: storeEmail, password: storePass })
    expect(login.status).toBe(200)
    const token = login.body.token

    // create product without sku under this store
    const payload = { name: 'Store Auto SKU', price: 5.0, stock: 2 }
    const res = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send(payload).expect(201)
    expect(res.body).toBeTruthy()
    expect(res.body.sku).toBeTruthy()
    const expectedPrefix = storeName.replace(/\s+/g, '').slice(0,3).toUpperCase()
    expect(res.body.sku.startsWith(expectedPrefix)).toBe(true)
    expect(/^[A-Z]{3}\d{5}$/.test(res.body.sku)).toBe(true)

    // cleanup product and store
    await db.query('DELETE FROM products WHERE id = $1', [res.body.id])
    await db.query('DELETE FROM users WHERE id = $1', [reg.body.userId])
    await db.query('DELETE FROM stores WHERE id = $1', [storeId])
  })

  it('should retry generation when first candidate collides', async () => {
    // Create a store to scope the SKU
    const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`
    const storeEmail = `store2+${uniq()}@local`
    const storePass = 'Store456!'
    const storeUsername = `s2-${uniq()}`
    const storeName = `CollideStore ${uniq()}`
    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: storeUsername, email: storeEmail, password: storePass })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId

    // login
    const login = await request(app).post('/api/auth/login').send({ email: storeEmail, password: storePass })
    expect(login.status).toBe(200)
    const token = login.body.token

    // determine prefix
    const prefix = storeName.replace(/\s+/g, '').slice(0,3).toUpperCase()

    // Prepare deterministic Math.random sequence: first value yields candidate that we'll pre-insert (collision), second yields different candidate
    const seq = [0.12345, 0.54321]
    const origRandom = Math.random
    Math.random = () => (seq.length ? seq.shift() : 0.99999)

    try {
      // compute the first candidate value as the code would
      const firstRand = Math.floor(0.12345 * 100000).toString().padStart(5, '0')
      const firstCandidate = `${prefix}${firstRand}`
      // pre-insert colliding product with same SKU in same store
      const ins = await db.query('INSERT INTO products (sku, name, price, stock, store_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [firstCandidate, 'CollideProd', 1, 1, storeId])
      const collidingId = ins.rows[0].id

      // Now create product via API; Math.random is primed so first candidate collides, code should retry and pick next
      const payload = { name: 'Should Retry SKU', price: 9.9, stock: 1 }
      const res = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send(payload).expect(201)
      expect(res.body).toBeTruthy()
      expect(res.body.sku).toBeTruthy()
      expect(res.body.sku).not.toBe(firstCandidate)
      // ensure new sku matches expected pattern and prefix
      expect(res.body.sku.startsWith(prefix)).toBe(true)
      expect(/^[A-Z]{3}\d{5}$/.test(res.body.sku)).toBe(true)

      // cleanup
      await db.query('DELETE FROM products WHERE id = $1 OR id = $2', [res.body.id, collidingId])
      await db.query('DELETE FROM users WHERE id = $1', [reg.body.userId])
      await db.query('DELETE FROM stores WHERE id = $1', [storeId])
    } finally {
      Math.random = origRandom
    }
  })
})
