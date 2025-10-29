const request = require('supertest')

// Mock schemaCache before loading the app so startup doesn't hit the real DB
jest.mock('../src/schemaCache', () => ({
  init: async () => ({}),
  hasColumn: (table, col) => {
    // pretend products has store_seq and is_repacking for this test
    if (table === 'products' && (col === 'store_seq' || col === 'is_repacking')) return true
    return false
  },
  cache: { initialized: true, columns: { products: new Set(['store_seq', 'is_repacking']) } }
}))

// Provide a fake db module we can control
const db = require('../src/db')
jest.spyOn(db, 'query').mockImplementation((text, params) => {
  // When pos route searches by store_seq it uses a query containing 'store_seq = $1'
  if (typeof text === 'string' && text.includes('store_seq =')) {
    // return a single product row as the DB would
    return Promise.resolve({ rows: [
      { id: 42, sku: 'PLU00042', name: 'Scale Product', price: 100, mrp: null, unit: 'kg', tax_percent: 0, stock: 50, store_seq: params && params[0] }
    ] })
  }
  // default mock response
  return Promise.resolve({ rows: [] })
})

const app = require('../src/index')

describe('POS barcode parsing (integration)', () => {
  test('barcode starting with # parses store_seq and qty and returns scale_qty', async () => {
    const barcode = '#00000201335' // store_seq = 000002 -> 2, qtyPart = 01335 -> 1.335
    const res = await request(app).get('/api/pos/products').query({ query: barcode })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
    const item = res.body[0]
    // scale_qty should be attached and equal to 1.335
    expect(item).toHaveProperty('scale_qty')
    // numeric comparison allowing floating point tolerance
    expect(Number(item.scale_qty)).toBeCloseTo(1.335, 3)
    // also ensure the product returned is the mocked one
    expect(item).toHaveProperty('id', 42)
    expect(item).toHaveProperty('sku', 'PLU00042')
  })
})
