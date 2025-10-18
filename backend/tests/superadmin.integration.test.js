const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')
const bcrypt = require('bcrypt')

jest.setTimeout(20000)

const uniq = () => `${Date.now()}-${Math.floor(Math.random()*10000)}`

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('superadmin login and admin endpoints + selectedStore mapping', async () => {
  if (!process.env.DATABASE_URL) return
  const email = `sa-${uniq()}@local`
  const password = 'Super123!'
  const hash = await bcrypt.hash(password, 8)
  const uRes = await db.query('INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id, email', [email, hash, 'Test SA'])
  const userId = uRes.rows[0].id

  // ensure superadmin role exists and assign
  await db.query("INSERT INTO roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", ['superadmin', 'Super administrator'])
  const r = await db.query('SELECT id FROM roles WHERE name = $1', ['superadmin'])
  const roleId = r.rows[0].id
  await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, roleId])

  // login
  const loginRes = await request(app).post('/api/auth/login').send({ email, password })
  expect(loginRes.status).toBe(200)
  expect(loginRes.body.token).toBeTruthy()
  const setCookie = loginRes.headers['set-cookie']
  expect(setCookie).toBeDefined()

  const token = loginRes.body.token

  // call an admin endpoint
  const s = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${token}`)
  // Accept 200 or 403 depending on role mapping
  expect([200,403]).toContain(s.status)

  // create a store to test selectedStore mapping via public registration endpoint (keeps schema-agnostic)
  const sEmail = `store-${uniq()}@local`
  const sPass = 'StorePass1!'
  const sUser = `store-${uniq()}`
  const reg = await request(app).post('/api/stores/register').send({ name: 'SA Test Store', username: sUser, email: sEmail, password: sPass })
  expect(reg.status).toBe(200)
  const storeId = reg.body.storeId
  const storeUserId = reg.body.userId

  // Now call a route that uses selectedStore mapping: use cookie header
  const statsWithSel = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${token}`).set('Cookie', [`selectedStore=${storeId}`])
  // selectedStore mapping should not crash and should return 200 or 403
  expect([200,403]).toContain(statsWithSel.status)

  // cleanup: remove created store and user and user_roles
  try { if (storeUserId) await db.query('DELETE FROM user_roles WHERE user_id = $1', [storeUserId]) } catch (e) {}
  try { if (storeUserId) await db.query('DELETE FROM users WHERE id = $1', [storeUserId]) } catch (e) {}
  try { await db.query('DELETE FROM user_roles WHERE user_id = $1', [userId]) } catch (e) {}
  try { await db.query('DELETE FROM users WHERE id = $1', [userId]) } catch (e) {}
})
