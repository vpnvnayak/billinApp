const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

describe('store_seq for products', () => {
  test('store-scoped products have store_seq starting at 1', async () => {
    const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`
    const storeEmail = `seqstore+${uniq()}@local`
    const storePass = 'Seq123!'
    const storeUsername = `seq-${uniq()}`
    const storeName = `SeqStore ${uniq()}`
    const reg = await request(app).post('/api/stores/register').send({ name: storeName, username: storeUsername, email: storeEmail, password: storePass })
    expect(reg.status).toBe(200)
    const storeId = reg.body.storeId

    const login = await request(app).post('/api/auth/login').send({ email: storeEmail, password: storePass })
    expect(login.status).toBe(200)
    const token = login.body.token

    // create two products under this store without sku so generator and store_seq trigger run
    const p1 = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send({ name: 'Seq1', price: 1, stock: 1 }).expect(201)
    const p2 = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send({ name: 'Seq2', price: 2, stock: 2 }).expect(201)

    expect(p1.body.store_seq).toBe(1)
    expect(p2.body.store_seq).toBe(2)

    // create a product globally (no store) - should have null store_seq or undefined
    const pg = await request(app).post('/api/products').send({ name: 'GlobalSeq', price: 5, stock: 5 }).expect(201)
    expect(pg.body.store_seq === null || pg.body.store_seq === undefined).toBe(true)

    // cleanup
    await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [[p1.body.id, p2.body.id, pg.body.id]])
    await db.query('DELETE FROM users WHERE id = $1', [reg.body.userId])
    await db.query('DELETE FROM stores WHERE id = $1', [storeId])
  })
})
