const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

describe('Purchases for is_repacking products', () => {
  afterAll(async () => {
    try { await db.pool.end() } catch (e) {}
  })

  function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

  it('happy path: purchase updates product master (no variants)', async () => {
    // register store and login
    const storeName = `RepackStore ${uniq()}`
    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: `u-${uniq()}`, email: `r+${uniq()}@local`, password: 'Store123!' })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId
    const userId = reg.body.userId

    const login = await request(app).post('/api/auth/login').send({ email: reg.body.email || reg.body.username || reg.body.user?.email || reg.body.user?.username, password: 'Store123!' })
    // fallback login using provided email used above
    const token = login.status === 200 ? login.body.token : (await request(app).post('/api/auth/login').send({ email: `r+${uniq()}@local`, password: 'Store123!' })).body.token

    // create repacking product with stock 10, mrp 50, price 45
    const prodPayload = { name: 'Repack Rice', sku: `RICE-${uniq()}`, price: 45, mrp: 50, stock: 10, is_repacking: true }
    const pRes = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send(prodPayload).expect(201)
    const product = pRes.body
    expect(product).toBeTruthy()

    // create purchase adding 50 qty with mrp 65 and price 53
    const purchasePayload = {
      supplier_id: null,
      total_amount: 50 * 53,
      items: [ { product_id: product.id, sku: product.sku, name: product.name, qty: 50, price: 53, mrp: 65 } ]
    }
    const purRes = await request(app).post('/api/purchases').set('Authorization', `Bearer ${token}`).send(purchasePayload).expect(201)
    const purchase = purRes.body
    expect(purchase && purchase.id).toBeTruthy()

    // verify product master updated: stock = 10+50, mrp=65, price=53
    const qq = await db.query('SELECT stock, mrp, price FROM products WHERE id = $1', [product.id])
    expect(qq.rows.length).toBe(1)
    const row = qq.rows[0]
    expect(Number(row.stock)).toBe(60)
    expect(Number(row.mrp)).toBe(65)
    expect(Number(row.price)).toBe(53)

    // verify no variants exist for this product
    const vv = await db.query('SELECT COUNT(*) AS c FROM product_variants WHERE product_id = $1', [product.id])
    expect(Number(vv.rows[0].c)).toBe(0)

    // verify purchase_items inserted without variant_id
    const itemsQ = await db.query('SELECT variant_id FROM purchase_items WHERE purchase_id = $1', [purchase.id])
    expect(itemsQ.rows.length).toBeGreaterThan(0)
    for (const it of itemsQ.rows) {
      expect(it.variant_id === null || it.variant_id === undefined).toBeTruthy()
    }

    // cleanup
    try {
      await db.query('DELETE FROM purchase_items WHERE purchase_id = $1', [purchase.id])
      await db.query('DELETE FROM purchases WHERE id = $1', [purchase.id])
      await db.query('DELETE FROM products WHERE id = $1', [product.id])
      await db.query('DELETE FROM users WHERE id = $1', [userId])
      await db.query('DELETE FROM stores WHERE id = $1', [storeId])
    } catch (e) {}
  })

  it('concurrency: multiple purchases update master stock and do not create variants', async () => {
    // register store and login
    const storeName = `RepackConc ${uniq()}`
    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: `u-${uniq()}`, email: `rc+${uniq()}@local`, password: 'Store456!' })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId
    const userId = reg.body.userId
    const login = await request(app).post('/api/auth/login').send({ email: reg.body.email || `rc+${uniq()}@local`, password: 'Store456!' })
    const token = login.status === 200 ? login.body.token : ''

    // create repacking product with stock 10
    const prodPayload = { name: 'Repack Wheat', sku: `WHEAT-${uniq()}`, price: 40, mrp: 45, stock: 10, is_repacking: true }
    const pRes = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send(prodPayload).expect(201)
    const product = pRes.body

    // prepare two purchases
    const purchaseA = { supplier_id: null, total_amount: 50 * 60, items: [ { product_id: product.id, qty: 50, price: 60, mrp: 70, sku: product.sku, name: product.name } ] }
    const purchaseB = { supplier_id: null, total_amount: 30 * 55, items: [ { product_id: product.id, qty: 30, price: 55, mrp: 66, sku: product.sku, name: product.name } ] }

    // run concurrently
    const [r1, r2] = await Promise.all([
      request(app).post('/api/purchases').set('Authorization', `Bearer ${token}`).send(purchaseA),
      request(app).post('/api/purchases').set('Authorization', `Bearer ${token}`).send(purchaseB)
    ])
    expect([r1.status, r2.status].every(s => s === 201)).toBeTruthy()

    // check final product stock = 10 + 50 + 30 = 90
    const qq = await db.query('SELECT stock FROM products WHERE id = $1', [product.id])
    expect(Number(qq.rows[0].stock)).toBe(90)

    // verify no variants created
    const vv = await db.query('SELECT COUNT(*) AS c FROM product_variants WHERE product_id = $1', [product.id])
    expect(Number(vv.rows[0].c)).toBe(0)

    // ensure both purchase_items records for the two purchases have null variant_id
    const pids = [r1.body.id, r2.body.id].filter(Boolean)
    const itemsQ = await db.query('SELECT purchase_id, variant_id FROM purchase_items WHERE purchase_id = ANY($1)', [pids])
    expect(itemsQ.rows.length).toBeGreaterThanOrEqual(2)
    for (const it of itemsQ.rows) expect(it.variant_id === null || it.variant_id === undefined).toBeTruthy()

    // cleanup
    try {
      await db.query('DELETE FROM purchase_items WHERE purchase_id = ANY($1)', [pids])
      await db.query('DELETE FROM purchases WHERE id = ANY($1)', [pids])
      await db.query('DELETE FROM products WHERE id = $1', [product.id])
      await db.query('DELETE FROM users WHERE id = $1', [userId])
      await db.query('DELETE FROM stores WHERE id = $1', [storeId])
    } catch (e) {}
  })
})
