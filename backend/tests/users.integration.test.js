const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')

jest.setTimeout(20000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

beforeAll(async () => {
  // ensure roles exist
  await db.query("INSERT INTO roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", ['superadmin', 'Super administrator'])
  await db.query("INSERT INTO roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", ['storeadmin', 'Store administrator'])
  await db.query("INSERT INTO roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", ['cashier', 'Cashier user'])
})

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('storeadmin can create another storeadmin scoped to their store', async () => {
  // register a new store (this creates a storeadmin user)
  const email = `sa1+${uniq()}@local`
  const username = `sa1-${uniq()}`
  const password = 'StoreAdmin1!'
  const reg = await request(app).post('/api/stores/register').send({ name: `Store ${uniq()}`, username, email, password })
  expect(reg.status).toBe(200)
  expect(reg.body.ok).toBeTruthy()
  const storeId = reg.body.storeId
  const creatorUserId = reg.body.userId

  // login as that storeadmin
  const login = await request(app).post('/api/auth/login').send({ email, password })
  expect(login.status).toBe(200)
  const token = login.body.token
  expect(token).toBeTruthy()

  // create another storeadmin user under the same store
  const newEmail = `sa2+${uniq()}@local`
  const newUsername = `sa2-${uniq()}`
  const newPassword = 'StoreAdmin2!'
  const createRes = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send({ username: newUsername, email: newEmail, phone: '9999999999', password: newPassword, role: 'storeadmin' })
  expect(createRes.status).toBe(200)
  expect(createRes.body.ok).toBeTruthy()
  const newUserId = createRes.body.id

  // verify in DB that new user has the same store_id
  const u = await db.query('SELECT store_id FROM users WHERE id = $1', [newUserId])
  expect(u.rows.length).toBe(1)
  expect(u.rows[0].store_id).toBe(storeId)

  // verify the role was assigned (via roles join)
  const rr = await db.query(`SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`, [newUserId])
  const roleNames = rr.rows.map(r => r.name)
  expect(roleNames).toContain('storeadmin')

  // cleanup created users and store
  await db.query('DELETE FROM user_roles WHERE user_id = $1 OR user_id = $2', [creatorUserId, newUserId])
  await db.query('DELETE FROM users WHERE id = $1 OR id = $2', [creatorUserId, newUserId])
  await db.query('DELETE FROM stores WHERE id = $1', [storeId])
})
