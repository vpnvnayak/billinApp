const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(20000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

describe('loyalty: award and spend points', () => {
  const created = { products: [], customers: [], sales: [] }

  afterAll(async () => {
    try {
      if (created.sales.length) await db.query('DELETE FROM sale_items WHERE sale_id = ANY($1::int[])', [created.sales])
      if (created.sales.length) await db.query('DELETE FROM sales WHERE id = ANY($1::int[])', [created.sales])
      if (created.products.length) await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [created.products])
      if (created.customers.length) await db.query('DELETE FROM customers WHERE id = ANY($1::int[])', [created.customers])
    } catch (e) {
      console.warn('loyalty test teardown failed', e && e.message)
    }
  })

  test('customer loses used points and gets awarded points for sale', async () => {
    // create a product
    const sku = `LOY-${uniq()}`
    const p = await db.query('INSERT INTO products (sku, name, price, stock) VALUES ($1,$2,$3,$4) RETURNING id, price', [sku, 'Loyalty Product', 60, 100])
    const prodId = p.rows[0].id
    created.products.push(prodId)

    // create a customer with initial loyalty points = 5
  const customerResp = await request(app).post('/api/customers').send({ name: `Loyal Cust ${uniq()}`, phone: `9${Math.floor(Math.random()*900000000)+100000000}`, loyalty_points: 5 })
    expect(customerResp.status).toBe(201)
    const custId = customerResp.body.id
    created.customers.push(custId)

    // Prepare sale: qty 2 at price 60 => subtotal 120, tax 0, grand=120 => awardPoints = floor(120/100) = 1
    const items = [{ product_id: prodId, qty: 2, price: 60, tax_percent: 0, sku, name: 'Loyalty Product' }]
    const loyaltyUsed = 3 // spend 3 points out of 5

    const saleResp = await request(app).post('/api/sales').send({ items, payment_method: 'cash', payment_breakdown: { loyalty_used: loyaltyUsed }, user_id: custId })
    expect(saleResp.status).toBe(201)
    const saleId = saleResp.body.id
    created.sales.push(saleId)

    // response should include loyalty awarded and used
    expect(Number(saleResp.body.loyalty_awarded || 0)).toBe(1)
    expect(Number(saleResp.body.loyalty_used || 0)).toBe(loyaltyUsed)

    // Verify customer's loyalty_points: initial 5 - 3 used + 1 awarded = 3
    const c2 = await db.query('SELECT loyalty_points FROM customers WHERE id = $1', [custId])
    expect(c2.rows.length).toBe(1)
    expect(Number(c2.rows[0].loyalty_points || 0)).toBe(3)
  })

  test('overspend loyalty: cannot go negative and is clamped to zero then awarded points applied', async () => {
    // create a product
    const sku = `LOY-OVER-${uniq()}`
    const p = await db.query('INSERT INTO products (sku, name, price, stock) VALUES ($1,$2,$3,$4) RETURNING id, price', [sku, 'Loyalty Over Product', 30, 100])
    const prodId = p.rows[0].id
    created.products.push(prodId)

    // create a customer with initial loyalty points = 2
  const customerResp = await request(app).post('/api/customers').send({ name: `Loyal Cust Over ${uniq()}`, phone: `9${Math.floor(Math.random()*900000000)+100000000}`, loyalty_points: 2 })
    expect(customerResp.status).toBe(201)
    const custId = customerResp.body.id
    created.customers.push(custId)

    // Prepare sale: qty 2 at price 30 => subtotal 60, grand=60 => awardPoints = 0
    const items = [{ product_id: prodId, qty: 2, price: 30, tax_percent: 0, sku, name: 'Loyalty Over Product' }]
    const loyaltyUsed = 5 // attempt to spend more than available

    const saleResp = await request(app).post('/api/sales').send({ items, payment_method: 'cash', payment_breakdown: { loyalty_used: loyaltyUsed }, user_id: custId })
    expect(saleResp.status).toBe(201)
    const saleId = saleResp.body.id
    created.sales.push(saleId)

    // awardPoints = 0, loyalty_used recorded = requested, but DB should clamp to 0 then + awarded
    expect(Number(saleResp.body.loyalty_awarded || 0)).toBe(0)
    expect(Number(saleResp.body.loyalty_used || 0)).toBe(loyaltyUsed)

    // Verify customer's loyalty_points: initial 2 - 5 clamped to 0 + 0 awarded = 0
    const c2 = await db.query('SELECT loyalty_points FROM customers WHERE id = $1', [custId])
    expect(c2.rows.length).toBe(1)
    expect(Number(c2.rows[0].loyalty_points || 0)).toBe(0)
  })

  test('exact 100 awards 1 point', async () => {
    const sku = `LOY-100-${uniq()}`
    const p = await db.query('INSERT INTO products (sku, name, price, stock) VALUES ($1,$2,$3,$4) RETURNING id, price', [sku, 'Loyalty 100 Product', 100, 100])
    const prodId = p.rows[0].id
    created.products.push(prodId)

  const customerResp = await request(app).post('/api/customers').send({ name: `Loyal Cust100 ${uniq()}`, phone: `9${Math.floor(Math.random()*900000000)+100000000}`, loyalty_points: 0 })
    expect(customerResp.status).toBe(201)
    const custId = customerResp.body.id
    created.customers.push(custId)

    // one unit at 100 => grand=100 => awardPoints = 1
    const items = [{ product_id: prodId, qty: 1, price: 100, tax_percent: 0, sku, name: 'Loyalty 100 Product' }]
    const saleResp = await request(app).post('/api/sales').send({ items, payment_method: 'cash', payment_breakdown: {}, user_id: custId })
    expect(saleResp.status).toBe(201)
    created.sales.push(saleResp.body.id)
    expect(Number(saleResp.body.loyalty_awarded || 0)).toBe(1)

    const c2 = await db.query('SELECT loyalty_points FROM customers WHERE id = $1', [custId])
    expect(Number(c2.rows[0].loyalty_points || 0)).toBe(1)
  })

  test('multiple sales accumulate loyalty correctly', async () => {
    const sku = `LOY-MULTI-${uniq()}`
    const p = await db.query('INSERT INTO products (sku, name, price, stock) VALUES ($1,$2,$3,$4) RETURNING id, price', [sku, 'Loyalty Multi Product', 90, 100])
    const prodId = p.rows[0].id
    created.products.push(prodId)

  const customerResp = await request(app).post('/api/customers').send({ name: `Loyal CustMulti ${uniq()}`, phone: `9${Math.floor(Math.random()*900000000)+100000000}`, loyalty_points: 0 })
    expect(customerResp.status).toBe(201)
    const custId = customerResp.body.id
    created.customers.push(custId)

    // Sale 1: qty 2 at 90 => subtotal 180 => awardPoints = 1
    const items1 = [{ product_id: prodId, qty: 2, price: 90, tax_percent: 0, sku, name: 'Loyalty Multi Product' }]
    const s1 = await request(app).post('/api/sales').send({ items: items1, payment_method: 'cash', payment_breakdown: {}, user_id: custId })
    expect(s1.status).toBe(201)
    created.sales.push(s1.body.id)
    expect(Number(s1.body.loyalty_awarded || 0)).toBe(1)

    // Sale 2: qty 3 at 70 => subtotal 210 => awardPoints = 2
    const p2 = await db.query('INSERT INTO products (sku, name, price, stock) VALUES ($1,$2,$3,$4) RETURNING id, price', [`${sku}-2`, 'Loyalty Multi Product 2', 70, 100])
    const prodId2 = p2.rows[0].id
    created.products.push(prodId2)
    const items2 = [{ product_id: prodId2, qty: 3, price: 70, tax_percent: 0, sku: `${sku}-2`, name: 'Loyalty Multi Product 2' }]
    const s2 = await request(app).post('/api/sales').send({ items: items2, payment_method: 'cash', payment_breakdown: {}, user_id: custId })
    expect(s2.status).toBe(201)
    created.sales.push(s2.body.id)
    expect(Number(s2.body.loyalty_awarded || 0)).toBe(2)

    // total awarded = 1 + 2 = 3
    const c2 = await db.query('SELECT loyalty_points FROM customers WHERE id = $1', [custId])
    expect(Number(c2.rows[0].loyalty_points || 0)).toBe(3)
  })
})
