const request = require('supertest')

// Mock schemaCache before loading the app so startup doesn't hit the real DB
jest.mock('../src/schemaCache', () => ({
  init: async () => ({}),
  hasColumn: () => false,
  cache: { initialized: true }
}))

const db = require('../src/db')
jest.spyOn(db, 'query').mockImplementation((text, params) => {
  // Mock customer SELECT (list)
  if (typeof text === 'string' && text.includes('FROM customers')) {
    return Promise.resolve({ rows: [ { id: 1, name: 'Alice', phone: '1234567890', email: null, disabled: true, total_count: 1 } ] })
  }
  // Mock UPDATE customers (PUT)
  if (typeof text === 'string' && text.trim().toUpperCase().startsWith('UPDATE CUSTOMERS')) {
    // params: [name, phone, email, id, ...]
    const name = params && params[0]
    const phone = params && params[1]
    // attempt to read disabled from params if present
    const disabled = params && params.includes(true)
    return Promise.resolve({ rows: [ { id: Number(params && params[3] || 1), name: name || 'Alice', phone: phone || null, email: params && params[2] || null, disabled: !!disabled } ] })
  }
  // Mock INSERT supplier
  if (typeof text === 'string' && text.includes('INSERT INTO suppliers')) {
    // params: [name, phone, email, website, executive_name, phone1, phone2, address, city, tin_gstin, state, credit_due, storeId]
    return Promise.resolve({ rows: [ { id: 55, name: params && params[0], phone: params && params[1] || null, phone1: params && params[5] || null, email: params && params[2] || null } ] })
  }
  // Mock SELECT suppliers
  if (typeof text === 'string' && text.includes('FROM suppliers')) {
    return Promise.resolve({ rows: [ { id: 55, name: 'SupplierX', phone: null, phone1: '9999999999', email: 's@example.com' } ] })
  }
  return Promise.resolve({ rows: [] })
})

const app = require('../src/index')

describe('Customers disabled and Suppliers phone behavior', () => {
  test('PUT /api/customers/:id should accept disabled and return disabled flag', async () => {
    const res = await request(app).put('/api/customers/1').send({ name: 'Alice', phone: '1234567890', disabled: true })
    expect(res.statusCode).toBe(200)
    expect(res.body).toHaveProperty('disabled')
    expect(res.body.disabled).toBe(true)
    expect(res.body).toHaveProperty('name', 'Alice')
  })

  test('GET /api/customers should include disabled field in list', async () => {
    const res = await request(app).get('/api/customers')
    expect(res.statusCode).toBe(200)
    // GET returns { data, total } in DB-backed path; our mock returns rows array directly via r.rows mapping
    // Accept both shapes
    if (Array.isArray(res.body)) {
      expect(res.body[0]).toHaveProperty('disabled')
      expect(res.body[0].disabled).toBe(true)
    } else {
      expect(res.body).toHaveProperty('data')
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data[0]).toHaveProperty('disabled')
      expect(res.body.data[0].disabled).toBe(true)
    }
  })

  test('POST /api/suppliers with only phone1 should return phone null and phone1 set', async () => {
    const payload = { name: 'SupplierX', phone1: '9999999999' }
    const res = await request(app).post('/api/suppliers').send(payload)
    expect(res.statusCode).toBe(201)
    expect(res.body).toHaveProperty('phone')
    expect(res.body.phone).toBeNull()
    expect(res.body).toHaveProperty('phone1', '9999999999')
  })

  test('GET /api/suppliers returns phone null and phone1 populated', async () => {
    const res = await request(app).get('/api/suppliers')
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty('phone')
    expect(res.body[0].phone).toBeNull()
    expect(res.body[0]).toHaveProperty('phone1')
    expect(res.body[0].phone1).toBe('9999999999')
  })
})
