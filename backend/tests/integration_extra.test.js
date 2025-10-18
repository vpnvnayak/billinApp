const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')
const helpers = require('./testHelpers')

jest.setTimeout(20000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('SKU uniqueness: create duplicate should be rejected', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `SKU-${uniq()}`
  const r1 = await request(app).post('/api/products').send({ name: 'P1', sku, price: 10, stock: 5 })
  expect(r1.status).toBe(201)
  const r2 = await request(app).post('/api/products').send({ name: 'P2', sku, price: 12, stock: 3 })
  expect(r2.status).toBe(400)
  // cleanup
  await helpers.cleanupBySku(sku)
})

test('Edit purchase updates stock and items', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `EDIT-${uniq()}`
  // create base product with mrp 100 and stock 5
  const p = await request(app).post('/api/products').send({ name: 'EProd', sku, price: 90, mrp: 100, stock: 5 })
  expect(p.status).toBe(201)
  const prodId = p.body.id

  // create purchase with qty 4 of that product
  const createResp = await request(app).post('/api/purchases').send({ supplier_id: null, total_amount: 360, items: [{ product_id: prodId, sku, name: 'EProd', qty: 4, price: 90, mrp: 100, line_total: 360 }] })
  expect(createResp.status).toBe(201)
  const purchaseId = createResp.body.id

  // after creation, product stock should have increased by 4 (from 5 to >=9)
  // after creation, variant for mrp=100 should have stock >= 4
  const pv1 = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [prodId, 100])
  expect(pv1.rows.length).toBeGreaterThanOrEqual(1)
  expect(Number(pv1.rows[0].stock)).toBeGreaterThanOrEqual(4)

  // Now update purchase: change qty to 2 and change MRP to 110 (should create new product)
  const updBody = { supplier_id: null, total_amount: 220, items: [{ product_id: prodId, sku, name: 'EProd', qty: 2, price: 110, mrp: 110, line_total: 220 }] }
  const upd = await request(app).put(`/api/purchases/${purchaseId}`).send(updBody)
  expect(upd.status).toBe(200)

  // original variant (mrp=100) stock should be decreased compared to before update
  const pvBefore = pv1.rows[0]
  const pvAfterQ = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [prodId, 100])
  const pvAfter = pvAfterQ.rows[0]
  expect(Number(pvAfter.stock)).toBeLessThanOrEqual(Number(pvBefore.stock))

  // new variant with mrp 110 should exist and have stock >= 2
  const pvNewQ = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [prodId, 110])
  expect(pvNewQ.rows.length).toBeGreaterThanOrEqual(1)
  expect(Number(pvNewQ.rows[0].stock)).toBeGreaterThanOrEqual(2)

  // ensure purchase items now reference the new variant id
  const purDetail = await request(app).get(`/api/purchases/${purchaseId}`)
  expect(purDetail.status).toBe(200)
  const its = purDetail.body.items || []
  expect(its.length).toBeGreaterThanOrEqual(1)
  expect(its[0].variant_id).toBe(pvNewQ.rows[0].id)

  // cleanup
  await helpers.cleanupBySku(sku)
})

test('Allow two products with same SKU but different MRP', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `DUP-${uniq()}`
  const a = await request(app).post('/api/products').send({ name: 'A', sku, price: 50, mrp: 100, stock: 1 })
  const b = await request(app).post('/api/products').send({ name: 'B', sku, price: 60, mrp: 110, stock: 2 })
  expect(a.status).toBe(201)
  expect(b.status).toBe(201)
  // cleanup
  await helpers.cleanupBySku(sku)
})

test('Purchase without product_id resolves by SKU+MRP and updates stock', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `RES-${uniq()}`
  // create product with mrp 200
  const p = await request(app).post('/api/products').send({ name: 'R', sku, price: 180, mrp: 200, stock: 2 })
  expect(p.status).toBe(201)
  const prodId = p.body.id

  // purchase item without product_id but with same sku & mrp
  const pur = await request(app).post('/api/purchases').send({ supplier_id: null, total_amount: 200, items: [{ sku, name: 'R', qty: 5, price: 200, mrp: 200, line_total: 1000 }] })
  expect(pur.status).toBe(201)

  // product_variants for mrp=200 should have stock >= 5
  const pvRes = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [prodId, 200])
  expect(pvRes.rows.length).toBeGreaterThanOrEqual(1)
  expect(Number(pvRes.rows[0].stock)).toBeGreaterThanOrEqual(5)

  // cleanup
  await helpers.cleanupBySku(sku)
})

test('Purchase with product_id and matching MRP updates stock', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `PID-${uniq()}`
  const p = await request(app).post('/api/products').send({ name: 'P', sku, price: 120, mrp: 150, stock: 1 })
  expect(p.status).toBe(201)
  const pid = p.body.id

  const pur = await request(app).post('/api/purchases').send({ supplier_id: null, total_amount: 300, items: [{ product_id: pid, sku, name: 'P', qty: 3, price: 150, mrp: 150, line_total: 450 }] })
  expect(pur.status).toBe(201)

  // product_variants for mrp=150 should have stock >= 4
  const pvRes2 = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [pid, 150])
  expect(pvRes2.rows.length).toBeGreaterThanOrEqual(1)
  expect(Number(pvRes2.rows[0].stock)).toBeGreaterThanOrEqual(4)

  try { await db.query('DELETE FROM purchase_items WHERE sku = $1', [sku]) } catch (e) {}
  try { await db.query('DELETE FROM purchases WHERE id NOT IN (SELECT DISTINCT purchase_id FROM purchase_items)') } catch (e) {}
  try { await db.query('DELETE FROM products WHERE sku = $1', [sku]) } catch (e) {}
})

test('Null MRP handling: null equals null', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `NULL-${uniq()}`
  const p = await request(app).post('/api/products').send({ name: 'N', sku, price: 50, mrp: null, stock: 2 })
  expect(p.status).toBe(201)
  const pid = p.body.id

  const pur = await request(app).post('/api/purchases').send({ supplier_id: null, total_amount: 100, items: [{ product_id: pid, sku, name: 'N', qty: 2, price: 50, mrp: null, line_total: 100 }] })
  expect(pur.status).toBe(201)

  // product_variants for mrp IS NULL should have stock >= 4
  const pvNull = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 AND mrp IS NULL', [pid])
  expect(pvNull.rows.length).toBeGreaterThanOrEqual(1)
  expect(Number(pvNull.rows[0].stock)).toBeGreaterThanOrEqual(4)

  try { await db.query('DELETE FROM purchase_items WHERE sku = $1', [sku]) } catch (e) {}
  try { await db.query('DELETE FROM purchases WHERE id NOT IN (SELECT DISTINCT purchase_id FROM purchase_items)') } catch (e) {}
  try { await db.query('DELETE FROM products WHERE sku = $1', [sku]) } catch (e) {}
})

test('SKU uniqueness on update: cannot change to existing SKU', async () => {
  if (!process.env.DATABASE_URL) return
  const s1 = `S1-${uniq()}`
  const s2 = `S2-${uniq()}`
  const a = await request(app).post('/api/products').send({ name: 'A', sku: s1, price: 5, stock: 2 })
  const b = await request(app).post('/api/products').send({ name: 'B', sku: s2, price: 6, stock: 2 })
  expect(a.status).toBe(201); expect(b.status).toBe(201)
  const idA = a.body.id
  // attempt to update A to have SKU of B
  const upd = await request(app).put(`/api/products/${idA}`).send({ name: 'A', sku: s2, price: 5, stock: 2 })
  expect(upd.status).toBe(400)
  // cleanup
  try { await db.query('DELETE FROM products WHERE sku = ANY($1::text[])', [[s1,s2]]) } catch (e) {}
})

test('Zero stock: sale should be rejected when product stock is 0', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `ZS-${uniq()}`
  const p = await request(app).post('/api/products').send({ name: 'ZeroStock', sku, price: 10, stock: 0 })
  expect(p.status).toBe(201)
  const pid = p.body.id
  // attempt sale
  const sale = await request(app).post('/api/sales').send({ items: [{ product_id: pid, qty: 1, price: 10 }] })
  expect(sale.status).toBe(400)
  // cleanup
  try { await db.query('DELETE FROM products WHERE id = $1', [pid]) } catch (e) {}
})

test('Purchase with different MRP creates new product and updates its stock', async () => {
  if (!process.env.DATABASE_URL) return
  const sku = `PM-${uniq()}`
  // create existing product with mrp 100
  const p = await request(app).post('/api/products').send({ name: 'Orig', sku, price: 90, mrp: 100, stock: 5 })
  expect(p.status).toBe(201)
  const origId = p.body.id

  // Post purchase with same SKU but MRP 110 for qty 3
  const purchaseBody = { supplier_id: null, total_amount: 330, items: [{ product_id: origId, sku, name: 'Orig', qty: 3, price: 110, mrp: 110, line_total: 330 }] }
  const pur = await request(app).post('/api/purchases').send(purchaseBody)
  expect(pur.status).toBe(201)

  // product_variants with mrp 110 should exist for the product and have stock >= 3
  const pvMatches = await db.query('SELECT id, mrp, stock FROM product_variants WHERE product_id = $1 AND mrp IS NOT DISTINCT FROM $2', [origId, 110])
  expect(pvMatches.rows.length).toBeGreaterThanOrEqual(1)
  expect(Number(pvMatches.rows[0].stock)).toBeGreaterThanOrEqual(3)

  // ensure purchase items reference variant_id for the new variant
  const purDetail2 = await request(app).get(`/api/purchases/${pur.body.id}`)
  expect(purDetail2.status).toBe(200)
  const its2 = purDetail2.body.items || []
  expect(its2.length).toBeGreaterThanOrEqual(1)
  // find an item with mrp 110
  const itNew = its2.find(it => Number(it.mrp) === 110 || it.variant_id === pvMatches.rows[0].id)
  expect(itNew).toBeTruthy()

  // cleanup
  try { await db.query('DELETE FROM purchase_items WHERE sku = $1', [sku]) } catch (e) {}
  try { await db.query('DELETE FROM purchases WHERE id NOT IN (SELECT DISTINCT purchase_id FROM purchase_items)') } catch (e) {}
  try { await db.query('DELETE FROM products WHERE sku = $1', [sku]) } catch (e) {}
})
