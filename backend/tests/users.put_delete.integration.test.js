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

test('PUT updates user fields and roles; DELETE removes user', async () => {
  // register a new store (creates storeadmin)
  const email = `sa-put-${uniq()}@local`
  const username = `sa-put-${uniq()}`
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

  // create a new cashier user
  const newEmail = `u1+${uniq()}@local`
  const newUsername = `u1-${uniq()}`
  const createRes = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send({ username: newUsername, email: newEmail, phone: '9999999999', password: 'Secret1!', roles: ['cashier'] })
  expect(createRes.status).toBe(200)
  expect(createRes.body.ok).toBeTruthy()
  const newUserId = createRes.body.id

  // update the user: change phone and add storeadmin role
  const updatedEmail = `u1-updated+${uniq()}@local`
  const updRes = await request(app).put(`/api/users/${newUserId}`).set('Authorization', `Bearer ${token}`).send({ email: updatedEmail, phone: '8888888888', roles: ['cashier','storeadmin'] })
  expect(updRes.status).toBe(200)

  // verify roles in DB
  const rr = await db.query(`SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`, [newUserId])
  const roleNames = rr.rows.map(r => r.name)
  expect(roleNames).toContain('storeadmin')
  expect(roleNames).toContain('cashier')

  // delete the user
  const delRes = await request(app).delete(`/api/users/${newUserId}`).set('Authorization', `Bearer ${token}`)
  expect(delRes.status).toBe(200)

  // verify deletion
  const u = await db.query('SELECT id FROM users WHERE id = $1', [newUserId])
  expect(u.rows.length).toBe(0)

  // cleanup created creator user and store
  await db.query('DELETE FROM users WHERE id = $1', [creatorUserId])
  await db.query('DELETE FROM stores WHERE id = $1', [storeId])
})
