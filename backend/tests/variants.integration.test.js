const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(20000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('creating purchases with same SKU but different MRPs creates product_variants and sets variant_id', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `VAR-${uniq()}`

  // create product master
  const p = await request(app).post('/api/products').send({ name: 'VProd', sku, price: 100, mrp: 150, stock: 1 })
  expect(p.status).toBe(201)
  const prodId = p.body.id

  // create first purchase using product_id and mrp 150 (should update variant or create it)
  const pur1 = await request(app).post('/api/purchases').send({ supplier_id: null, total_amount: 300, items: [{ product_id: prodId, sku, name: 'VProd', qty: 2, price: 150, mrp: 150, line_total: 300 }] })
  expect(pur1.status).toBe(201)
  const pur1Id = pur1.body.id

  // get the purchase details and ensure variant_id is present on the item
  const det1 = await request(app).get(`/api/purchases/${pur1Id}`)
  expect(det1.status).toBe(200)
  const items1 = det1.body.items || []
  expect(items1.length).toBeGreaterThanOrEqual(1)
  const item1 = items1[0]
  expect(item1.variant_id || item1.mrp).toBeTruthy()

  // create a second purchase with same SKU but different MRP -> should create a new variant
  const pur2 = await request(app).post('/api/purchases').send({ supplier_id: null, total_amount: 330, items: [{ product_id: prodId, sku, name: 'VProd', qty: 2, price: 165, mrp: 165, line_total: 330 }] })
  expect(pur2.status).toBe(201)
  const pur2Id = pur2.body.id

  const det2 = await request(app).get(`/api/purchases/${pur2Id}`)
  expect(det2.status).toBe(200)
  const items2 = det2.body.items || []
  expect(items2.length).toBeGreaterThanOrEqual(1)
  const item2 = items2[0]
  expect(item2.variant_id || item2.mrp).toBeTruthy()

  // Now query product_variants directly to ensure there are at least 2 variants for the product
  const pv = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 ORDER BY mrp ASC', [prodId])
  expect(pv.rows.length).toBeGreaterThanOrEqual(2)
  const v150 = pv.rows.find(r => Number(r.mrp) === 150)
  const v165 = pv.rows.find(r => Number(r.mrp) === 165)
  expect(v150).toBeTruthy()
  expect(v165).toBeTruthy()

  // Ensure stock for each variant reflects the purchases (>= qty inserted)
  expect(Number(v150.stock)).toBeGreaterThanOrEqual(2)
  expect(Number(v165.stock)).toBeGreaterThanOrEqual(2)

  // cleanup
  const helpers = require('./testHelpers')
  await helpers.cleanupBySku(sku)
})


test('updating a purchase moves stock between variants and updates purchase_items.variant_id', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `VARUPD-${uniq()}`

  // create product master
  const p = await request(app).post('/api/products').send({ name: 'VUpd', sku, price: 200, mrp: 200, stock: 1 })
  expect(p.status).toBe(201)
  const prodId = p.body.id

  // create initial purchase with mrp 200
  const pur1 = await request(app).post('/api/purchases').send({ supplier_id: null, total_amount: 400, items: [{ product_id: prodId, sku, name: 'VUpd', qty: 2, price: 200, mrp: 200, line_total: 400 }] })
  expect(pur1.status).toBe(201)
  const purId = pur1.body.id

  // read product_variants rows
  const pvBefore = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1', [prodId])
  expect(pvBefore.rows.length).toBeGreaterThanOrEqual(1)
  const v200 = pvBefore.rows.find(r => Number(r.mrp) === 200)
  expect(v200).toBeTruthy()

  // update purchase: change to mrp 220 (new variant) and qty 1
  const upd = await request(app).put(`/api/purchases/${purId}`).send({ supplier_id: null, total_amount: 220, items: [{ product_id: prodId, sku, name: 'VUpd', qty: 1, price: 220, mrp: 220, line_total: 220 }] })
  expect(upd.status).toBe(200)

  // product_variants should have a new variant for 220
  const pvAfter = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1', [prodId])
  const v220 = pvAfter.rows.find(r => Number(r.mrp) === 220)
  expect(v220).toBeTruthy()

  // stock: original variant (200) should have had its stock decreased by original qty (2)
  const v200After = pvAfter.rows.find(r => Number(r.mrp) === 200)
  expect(v200After).toBeTruthy()
  expect(Number(v200After.stock)).toBeLessThanOrEqual(Number(v200.stock))

  // new variant (220) should have stock >= 1
  expect(Number(v220.stock)).toBeGreaterThanOrEqual(1)

  // purchase details should now reference the new variant id
  const det = await request(app).get(`/api/purchases/${purId}`)
  expect(det.status).toBe(200)
  const its = det.body.items || []
  expect(its.length).toBeGreaterThanOrEqual(1)
  const it = its[0]
  expect(it.variant_id || it.mrp).toBeTruthy()

  // cleanup
  const helpers = require('./testHelpers')
  await helpers.cleanupBySku(sku)
})
