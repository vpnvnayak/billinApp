// Unit tests for SKU generation logic — fast tests that mock DB and schema cache
const request = require('supertest')

describe('unit: SKU generation (mocked DB)', () => {
  afterAll(() => {
    // ensure env cleanup
    delete process.env.STORE_NAME
  })

  it('generates SKU using process.env.STORE_NAME when no store scoped', async () => {
    jest.resetModules()
    process.env.STORE_NAME = 'MyStore'

    // per-test mocks
    const mockDb = {
      pool: { end: jest.fn() },
      query: jest.fn((sql, params) => {
        if (/SELECT id FROM products WHERE LOWER\(sku\)/i.test(sql)) {
          return Promise.resolve({ rows: [] })
        }
        if (/INSERT INTO products/i.test(sql)) {
          const sku = params[0]
          return Promise.resolve({ rows: [{ id: 9999, sku, name: params[1] }] })
        }
        if (/SELECT store_seq FROM products/i.test(sql)) {
          return Promise.resolve({ rows: [{ store_seq: 1 }] })
        }
        return Promise.resolve({ rows: [] })
      })
    }
  const mockSchema = { hasColumn: jest.fn(() => false), init: jest.fn(() => Promise.resolve()) }

    jest.doMock('../src/db', () => mockDb)
    jest.doMock('../src/schemaCache', () => mockSchema)

    const app = require('../src/index')
    const res = await request(app).post('/api/products').send({ name: 'Unit Test SKU', price: 1.2, stock: 1 }).expect(201)
    expect(res.body).toBeTruthy()
    expect(res.body.sku).toMatch(/^[A-Z]{2}\d{6}$/)
    expect(res.body.sku.startsWith('MY')).toBe(true)
    // reset module registry so later test files load real modules
    jest.resetModules()
    delete process.env.STORE_NAME
  })

  it('retries generation when duplicate candidate is found (mocked collision)', async () => {
    jest.resetModules()
    process.env.STORE_NAME = 'CoStore'

    // control Math.random to produce deterministic candidates
    const seq = [0.111111, 0.222222]
    const origRandom = Math.random
    Math.random = () => seq.shift() || 0.999999

    // compute first candidate to set as colliding in mock
    const firstRand = Math.floor(0.111111 * 1000000).toString().padStart(6, '0')
    const prefix = 'CO' // from 'CoStore'
    const firstCandidate = `${prefix}${firstRand}`

    const mockDb = {
      pool: { end: jest.fn() },
      query: jest.fn((sql, params) => {
        if (/SELECT id FROM products WHERE LOWER\(sku\)/i.test(sql)) {
          const candidate = params[0]
          if (candidate === firstCandidate) return Promise.resolve({ rows: [{ id: 1 }] })
          return Promise.resolve({ rows: [] })
        }
        if (/INSERT INTO products/i.test(sql)) {
          const sku = params[0]
          return Promise.resolve({ rows: [{ id: 7777, sku }] })
        }
        if (/SELECT store_seq FROM products/i.test(sql)) return Promise.resolve({ rows: [{ store_seq: 1 }] })
        return Promise.resolve({ rows: [] })
      })
    }
  const mockSchema = { hasColumn: jest.fn(() => false), init: jest.fn(() => Promise.resolve()) }

  jest.doMock('../src/db', () => mockDb)
  jest.doMock('../src/schemaCache', () => mockSchema)

    const app = require('../src/index')
    const res = await request(app).post('/api/products').send({ name: 'Unit Retry', price: 2.5 }).expect(201)
    expect(res.body).toBeTruthy()
    expect(res.body.sku).toMatch(/^[A-Z]{2}\d{6}$/)
    expect(res.body.sku).not.toBe(firstCandidate)

    Math.random = origRandom
    jest.resetModules()
    delete process.env.STORE_NAME
  })
})
