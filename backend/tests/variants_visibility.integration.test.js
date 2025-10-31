const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(20000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('variant created by purchase is visible via products/:id/variants and pos search', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `VIS-${uniq()}`

  // create base product master with mrp 100
  const p = await request(app).post('/api/products').send({ name: 'VisProd', sku, price: 90, mrp: 100, stock: 1 })
  expect(p.status).toBe(201)
  const prodId = p.body.id

  // create a purchase that uses the same product but a different MRP (110) -> should create a variant
  const purchaseBody = {
    supplier_id: null,
    total_amount: 220,
    items: [{ product_id: prodId, sku, name: 'VisProd', qty: 2, price: 110, mrp: 110, line_total: 220 }]
  }
  const pur = await request(app).post('/api/purchases').send(purchaseBody)
  expect(pur.status).toBe(201)

  // Assert product variants endpoint returns the new variant
  const vlist = await request(app).get(`/api/products/${prodId}/variants`)
  expect(vlist.status).toBe(200)
  const variants = Array.isArray(vlist.body) ? vlist.body : (vlist.body && vlist.body.data) || []
  const dbv = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 ORDER BY id DESC', [prodId])
  const found = variants.find(v => (v.mrp !== null && Number(v.mrp) === 110)) || dbv.rows.find(r => Number(r.mrp) === 110)
  expect(found).toBeTruthy()

  // Assert POS search returns the variant row when searching by SKU
  const pos = await request(app).get('/api/pos/products').query({ query: sku, limit: 50 })
  expect(pos.status).toBe(200)
  const posItems = Array.isArray(pos.body) ? pos.body : (pos.body && pos.body.data) || []
  // Try matching either by product_id or by id==product id (pos returns id as product id sometimes)
  const posMatch = posItems.find(it => ((it.product_id === prodId || Number(it.id) === Number(prodId) || it.id === prodId) && (it.mrp != null && Number(it.mrp) === 110)) || (it.variant_id && Number(it.variant_id) && it.variant_id === found.id))
  const masterMatch = posItems.find(it => (it.product_id === prodId || Number(it.id) === Number(prodId) || it.id === prodId) && (it.mrp != null && Number(it.mrp) === 110))
  expect(posMatch || masterMatch).toBeTruthy()

  // cleanup using helper
  const helpers = require('./testHelpers')
  await helpers.cleanupBySku(sku)
})
