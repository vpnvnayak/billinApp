const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(20000)

// This test ensures PUT /api/products/variants/:id updates only variant fields
// and does not modify the product master record.

describe('PUT /api/products/variants/:id', () => {
  let prodId, variantId

  beforeAll(async () => {
    // create a product
    const r = await db.query("INSERT INTO products (sku, name, price, mrp, unit, tax_percent, stock) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, sku, name, price, mrp, unit, tax_percent, stock", ['UTSKU123', 'Variant Update Test Product', 100, 120, 'Nos', 18, 10])
    prodId = r.rows[0].id
    // create a variant via direct insert to product_variants (simulate existing variant)
    const vr = await db.query("INSERT INTO product_variants (product_id, mrp, price, unit, tax_percent, stock, barcode) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, product_id, mrp, price, unit, tax_percent, stock, barcode", [prodId, 130, 110, 'Nos', 18, 5, 'V-UTSKU123'])
    variantId = vr.rows[0].id
  })

  afterAll(async () => {
    try { await db.query('DELETE FROM product_variants WHERE id = $1', [variantId]) } catch (e) {}
    try { await db.query('DELETE FROM products WHERE id = $1', [prodId]) } catch (e) {}
  })

  test('updates variant fields and leaves product master unchanged', async () => {
    // Read current product master and variant
    const prodBefore = (await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE id = $1', [prodId])).rows[0]
    const varBefore = (await db.query('SELECT id, product_id, mrp, price, unit, tax_percent, stock, barcode FROM product_variants WHERE id = $1', [variantId])).rows[0]

    const payload = { mrp: 999.99, price: 888.88, unit: 'G', tax_percent: 12, stock: 77, barcode: 'NEW-BARCODE' }

    const res = await request(app).put(`/api/products/variants/${variantId}`).send(payload)
  expect(res.status).toBe(200)
  expect(Number(res.body.id)).toBe(variantId)
  expect(Number(res.body.mrp)).toBeCloseTo(999.99)
  expect(Number(res.body.price)).toBeCloseTo(888.88)
  expect(res.body.unit).toBe('G')
  expect(Number(res.body.tax_percent)).toBe(12)
  expect(Number(res.body.stock)).toBe(77)
  expect(res.body.barcode).toBe('NEW-BARCODE')

    const prodAfter = (await db.query('SELECT id, sku, name, price, mrp, unit, tax_percent, stock FROM products WHERE id = $1', [prodId])).rows[0]
    const varAfter = (await db.query('SELECT id, product_id, mrp, price, unit, tax_percent, stock, barcode FROM product_variants WHERE id = $1', [variantId])).rows[0]

  // Product master should be unchanged (name, sku, price, mrp on master should remain same)
  expect(prodAfter.name).toBe(prodBefore.name)
  expect(prodAfter.sku).toBe(prodBefore.sku)
  expect(Number(prodAfter.price)).toBe(Number(prodBefore.price))
  expect(Number(prodAfter.mrp)).toBe(Number(prodBefore.mrp))

  // Variant should reflect new values (DB may return numeric types as strings)
  expect(Number(varAfter.mrp)).toBeCloseTo(999.99)
  expect(Number(varAfter.price)).toBeCloseTo(888.88)
  expect(varAfter.unit).toBe('G')
  expect(Number(varAfter.tax_percent)).toBe(12)
  expect(Number(varAfter.stock)).toBe(77)
  expect(varAfter.barcode).toBe('NEW-BARCODE')
  })
})
