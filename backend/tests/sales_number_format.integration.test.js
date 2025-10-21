const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(20000)

// Ensure the sales endpoint accepts string-formatted numbers like "0.00" for qty/price/tax_percent
// and that values with/without trailing .00 are treated as numerically equal (10 === 10.00)

describe('POST /api/sales numeric string formats', () => {
  const created = { products: [], sales: [] }

  afterAll(async () => {
    try {
      if (created.sales.length) await db.query('DELETE FROM sale_items WHERE sale_id = ANY($1::int[])', [created.sales])
      if (created.sales.length) await db.query('DELETE FROM sales WHERE id = ANY($1::int[])', [created.sales])
      if (created.products.length) await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [created.products])
    } catch (e) {
      console.warn('teardown failed', e && e.message)
    }
  })

  test('accepts string-formatted numbers like "10.00" and "0.00" and decrements product stock', async () => {
    // create product with sufficient stock
    const p = await db.query('INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, stock', ['FMT-STR-1', 'Format Test Product', 30, 35, 'Nos', 0, 100])
    const prodId = p.rows[0].id
    const initialStock = Number(p.rows[0].stock || 0)
    created.products.push(prodId)

    const payload = {
      items: [
        { product_id: prodId, qty: '10.00', price: '30.00', tax_percent: '0.00', sku: 'FMT-STR-1', name: 'Format Test Product' }
      ],
      payment_method: 'cash'
    }

    const res = await request(app).post('/api/sales').send(payload)
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    const saleId = res.body.id
    created.sales.push(saleId)

    // fetch sale detail and assert numeric values are stored and equal when coerced
    const detail = await request(app).get(`/api/sales/${saleId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.items).toBeDefined()
    expect(detail.body.items.length).toBeGreaterThan(0)
    const item = detail.body.items[0]

    // qty and tax_percent may be returned as numbers or strings depending on driver; coerce to Number for comparison
    expect(Number(item.qty)).toBe(10)
    expect(Number(item.price)).toBeCloseTo(30)
    expect(Number(item.tax_percent)).toBe(0)

    // verify product stock decreased by 10
    const prodAfter = (await db.query('SELECT stock FROM products WHERE id = $1', [prodId])).rows[0]
    expect(Number(prodAfter.stock)).toBe(initialStock - 10)
  })

  test('treats 10 and "10.00" as numerically equal across sales entries', async () => {
    // create product with large stock
    const p = await db.query('INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', ['FMT-STR-2', 'Format Equivalence Product', 10, 12, 'Nos', 0, 100])
    const prodId = p.rows[0].id
    created.products.push(prodId)

    // sale A: price as number 10
    const a = await request(app).post('/api/sales').send({ items: [{ product_id: prodId, qty: 1, price: 10, tax_percent: 0, sku: 'FMT-STR-2', name: 'Format Equivalence Product' }] })
    expect(a.status).toBe(201)
    created.sales.push(a.body.id)

    // sale B: price as string "10.00"
    const b = await request(app).post('/api/sales').send({ items: [{ product_id: prodId, qty: '1.00', price: '10.00', tax_percent: '0.00', sku: 'FMT-STR-2', name: 'Format Equivalence Product' }] })
    expect(b.status).toBe(201)
    created.sales.push(b.body.id)

    // fetch both sale items and compare numeric price equality
    const detailA = await request(app).get(`/api/sales/${a.body.id}`)
    const detailB = await request(app).get(`/api/sales/${b.body.id}`)
    expect(detailA.status).toBe(200)
    expect(detailB.status).toBe(200)
    const priceA = Number(detailA.body.items[0].price)
    const priceB = Number(detailB.body.items[0].price)
    expect(priceA).toBeCloseTo(priceB)
    expect(priceA).toBeCloseTo(10)
  })
})
