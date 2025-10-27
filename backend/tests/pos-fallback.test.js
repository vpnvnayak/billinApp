const request = require('supertest')

// Mock the db module used by the pos route
jest.mock('../src/db', () => ({
  query: jest.fn()
}))

const db = require('../src/db')
const app = require('../src/index')

describe('POS products fallback', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  test('falls back to products when variants return empty', async () => {
    // Provide a mock implementation that responds differently based on the SQL text.
    db.query.mockImplementation((sql, params) => {
      const s = String(sql || '').toLowerCase()
      if (s.includes("information_schema.columns")) {
        // schemaCache.init: pretend product_variants exists
        return Promise.resolve({ rows: [ { table_name: 'product_variants', column_name: 'id' } ] })
      }
      if (s.includes('from product_variants')) {
        // variants search -> return empty
        return Promise.resolve({ rows: [] })
      }
      if (s.includes('from products') && s.includes('sku ilike')) {
        // products fallback -> return one product
        return Promise.resolve({ rows: [{ id: 42, sku: 'BISL', name: 'Bisleri 1L', price: 10.0, mrp: null, unit: 'L', tax_percent: 0, stock: 5 }] })
      }
      // default: empty
      return Promise.resolve({ rows: [] })
    })

    const res = await request(app).get('/api/pos/products').query({ query: 'bisl', limit: 10 })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)
    expect(res.body[0].sku).toBe('BISL')
  })
})
