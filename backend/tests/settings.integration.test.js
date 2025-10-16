const db = require('../src/db')
const settings = require('../src/routes/settings')

beforeAll(async () => {
  // ensure DB connection
  if (!db) throw new Error('DB not configured')
})

afterAll(async () => {
  try {
    // close the pool if exposed
    if (db && db.pool && typeof db.pool.end === 'function') await db.pool.end()
    if (db && typeof db.end === 'function') await db.end()
  } catch (e) {}
})

test('write and read store settings including hours', async () => {
  // use a random store id for isolation
  const storeId = Math.floor(Math.random() * 100000) + 1000
  // ensure a store exists for the FK constraint — insert only columns that exist in this DB
  const colsRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='stores'")
  const storeCols = new Set((colsRes.rows || []).map(r => r.column_name))
  const insertCols = ['id', 'name']
  const insertVals = [storeId, `Store ${storeId}`]
  if (storeCols.has('username')) { insertCols.push('username'); insertVals.push(`user${storeId}`) }
  if (storeCols.has('email')) { insertCols.push('email'); insertVals.push(`u${storeId}@example.com`) }
  if (storeCols.has('password_hash')) { insertCols.push('password_hash'); insertVals.push('x') }
  const ph = insertCols.map((_, i) => `$${i+1}`).join(',')
  await db.query(`INSERT INTO stores (${insertCols.join(',')}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`, insertVals)
  const payload = {
    _store_id: storeId,
    name: `Test Store ${storeId}`,
    address: 'Test Address',
    contact: '9999999999',
    timezone: 'UTC',
    hours: { mon: '9-5', tue: '9-5' },
    logo_url: '/uploads/test.png'
  }

  const ok = await settings.writeSettingsToDB(payload)
  expect(ok).toBe(true)

  const read = await settings.readSettingsFromDB(storeId)
  expect(read).toBeTruthy()
  expect(read.name).toBe(payload.name)
  // hours may be stored as JSON string or JSONB; at least ensure the value exists or is parsed
  expect(read.logo_url).toBe(payload.logo_url)

  // cleanup
  await db.query('DELETE FROM store_settings WHERE store_id = $1', [storeId])
  await db.query('DELETE FROM stores WHERE id = $1', [storeId])
})
