const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(20000)
function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

describe('credit flow: prior customer credit + sale -> remaining credit stored', () => {
  const created = { products: [], customers: [], sales: [] }

  afterAll(async () => {
    try {
      if (created.sales.length) await db.query('DELETE FROM sale_items WHERE sale_id = ANY($1::int[])', [created.sales])
      if (created.sales.length) await db.query('DELETE FROM sales WHERE id = ANY($1::int[])', [created.sales])
      if (created.products.length) await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [created.products])
      if (created.customers.length) await db.query('DELETE FROM customers WHERE id = ANY($1::int[])', [created.customers])
    } catch (e) {
      console.warn('credit_flow teardown failed', e && e.message)
    }
  })

  test('customer prior credit X, sale Y, pay Z (< X+Y) => new credit = X+Y-Z and metadata annotated', async () => {
    if (!process.env.DATABASE_URL) return

    // check if customers.credit_due exists in this DB; skip if not
    const colCheck = await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='credit_due'")
    if (colCheck.rows.length === 0) {
      console.warn('customers.credit_due column missing; skipping credit flow integration test')
      return
    }

    const sku = `CREDIT-${uniq()}`
    // create a product (price = 50)
    const p = await db.query('INSERT INTO products (sku, name, price, stock) VALUES ($1,$2,$3,$4) RETURNING id, price', [sku, 'Credit Product', 50, 100])
    const prodId = p.rows[0].id
    created.products.push(prodId)

    // create a customer via API
    const phone = `9${Math.floor(Math.random()*900000000)+100000000}`
    const customerResp = await request(app).post('/api/customers').send({ name: `Credit Cust ${uniq()}`, phone })
    expect(customerResp.status).toBe(201)
    const custId = customerResp.body.id
    created.customers.push(custId)

    // Set prior credit X directly in DB (column exists)
    const priorCredit = 10.0
    await db.query('UPDATE customers SET credit_due = $1 WHERE id = $2', [priorCredit.toFixed(2), custId])

    // Create a sale Y = product price * qty (qty 1 => 50)
    const Y = 50.0
    const Z = 20.0 // amount paid (less than X+Y = 60)
    const items = [{ product_id: prodId, qty: 1, price: 50, tax_percent: 0, sku, name: 'Credit Product' }]

    const saleResp = await request(app).post('/api/sales').send({ items, payment_method: 'cash', payment_breakdown: { cash: Z }, user_id: custId })
    expect(saleResp.status).toBe(201)
    const saleId = saleResp.body.id
    created.sales.push(saleId)

    // Now fetch the customer credit_due from DB and expect new credit = X + Y - Z = 40
    const custAfter = await db.query('SELECT COALESCE(credit_due,0)::numeric AS credit_due FROM customers WHERE id = $1', [custId])
    expect(custAfter.rows.length).toBe(1)
    const newCredit = Number(custAfter.rows[0].credit_due || 0)
    const expected = priorCredit + Y - Z
    expect(newCredit).toBeCloseTo(expected, 4)

    // Verify sales.metadata contains previous_credit and credit_added (deficit)
    const saleMetaRes = await db.query('SELECT metadata FROM sales WHERE id = $1', [saleId])
    expect(saleMetaRes.rows.length).toBe(1)
    const meta = saleMetaRes.rows[0].metadata || {}
    // metadata values may be stored as numbers or strings; coerce to Number when comparing
    expect(Number(meta.previous_credit || 0)).toBeCloseTo(priorCredit, 4)
    const deficit = Math.max(0, (priorCredit + Y) - Z)
    expect(Number(meta.credit_added || 0)).toBeCloseTo(deficit, 4)
  })
})
