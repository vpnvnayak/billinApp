const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

describe('POST /api/products HSN persistence', () => {
  afterAll(async () => {
    try { await db.pool.end() } catch (e) {}
  })

  it('should persist hsn when creating a product', async () => {
    const payload = { name: 'HSN Test Product', price: 12.5, stock: 3, unit: 'Nos', tax_percent: 18, hsn: '1234.56' }
    const res = await request(app).post('/api/products').send(payload).expect(201)
    expect(res.body).toBeTruthy()
    expect(res.body.id).toBeTruthy()

    // Query DB directly to ensure hsn persisted
    const q = await db.query('SELECT id, hsn FROM products WHERE id = $1', [res.body.id])
    expect(q.rows.length).toBe(1)
    expect(q.rows[0].hsn).toBe('1234.56')

    // cleanup
    await db.query('DELETE FROM products WHERE id = $1', [res.body.id])
  })
})
