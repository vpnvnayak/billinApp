const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(20000)
function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('sale selecting variant_id decrements product_variants.stock and selecting master decrements products.stock', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `PVAR-${uniq()}`

  // create product master with initial stock 10
  const p = await request(app).post('/api/products').send({ name: 'POSVar', sku, price: 100, mrp: 100, stock: 10 })
  expect(p.status).toBe(201)
  const prodId = p.body.id

  // Prefer creating a variant record directly (faster and avoids purchase logic that may move product stock)
  let variantId = null
  let variantStockBefore = 0
  try {
    const ins = await db.query('INSERT INTO product_variants (product_id, mrp, price, stock) VALUES ($1,$2,$3,$4) RETURNING id, mrp, stock', [prodId, 120, 120, 4])
    variantId = ins.rows[0].id
    variantStockBefore = Number(ins.rows[0].stock || 0)
  } catch (e) {
    // fallback: use purchases flow if product_variants table or insert failed
    const pur = await request(app).post('/api/purchases').send({ supplier_id: null, total_amount: 480, items: [{ product_id: prodId, sku, name: 'POSVar', qty: 4, price: 120, mrp: 120, line_total: 480 }] })
    expect(pur.status).toBe(201)
    const pvBefore = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 ORDER BY mrp ASC', [prodId])
    expect(pvBefore.rows.length).toBeGreaterThanOrEqual(1)
    const variant = pvBefore.rows.find(r => Number(r.mrp) === 120) || pvBefore.rows[0]
    expect(variant).toBeTruthy()
    variantId = variant.id
    variantStockBefore = Number(variant.stock || 0)
  }

  // create a sale that selects the variant (qty 2)
  const sale1 = await request(app).post('/api/sales').send({ items: [{ product_id: prodId, variant_id: variantId, qty: 2, price: 120, tax_percent: 0 }], payment_method: 'cash' })
  expect(sale1.status).toBe(201)

  // verify variant stock decreased by 2
  const pvAfter1 = await db.query('SELECT id, mrp, stock FROM product_variants WHERE id = $1', [variantId])
  expect(pvAfter1.rows.length).toBe(1)
  const variantStockAfter = Number(pvAfter1.rows[0].stock || 0)
  expect(variantStockAfter).toBeCloseTo(variantStockBefore - 2, 4)

  // Now check product master stock before selling master
  const prodBefore = await db.query('SELECT id, stock FROM products WHERE id = $1', [prodId])
  expect(prodBefore.rows.length).toBe(1)
  const prodStockBefore = Number(prodBefore.rows[0].stock || 0)

  // create a sale that selects the master product (use_product_stock = true) qty 3
  const sale2 = await request(app).post('/api/sales').send({ items: [{ product_id: prodId, qty: 3, price: 100, tax_percent: 0, use_product_stock: true }], payment_method: 'cash' })
  expect(sale2.status).toBe(201)

  // verify product stock decreased by 3
  const prodAfter = await db.query('SELECT id, stock FROM products WHERE id = $1', [prodId])
  expect(prodAfter.rows.length).toBe(1)
  const prodStockAfter = Number(prodAfter.rows[0].stock || 0)
  expect(prodStockAfter).toBeCloseTo(prodStockBefore - 3, 4)

  // cleanup
  const helpers = require('./testHelpers')
  await helpers.cleanupBySku(sku)
})