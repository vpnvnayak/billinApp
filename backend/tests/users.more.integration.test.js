const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')
const bcrypt = require('bcrypt')

jest.setTimeout(20000)

function uniq() { return `${Date.now()}-${Math.floor(Math.random()*10000)}` }

beforeAll(async () => {
  // ensure roles exist
  await db.query("INSERT INTO roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", ['admin', 'Administrator'])
  await db.query("INSERT INTO roles (name, description) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", ['cashier', 'Cashier user'])
})

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('admin can create cashier user', async () => {
  const email = `adm-${uniq()}@local`
  const password = 'Admin123!'
  const h = await bcrypt.hash(password, 8)
  const uRes = await db.query('INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id', [email, h, 'Test Admin'])
  const userId = uRes.rows[0].id
  // ensure admin role exists and assign
  const r = await db.query('SELECT id FROM roles WHERE name = $1', ['admin'])
  const roleId = r.rows[0].id
  await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, roleId])

  // login as admin
  const login = await request(app).post('/api/auth/login').send({ email, password })
  expect(login.status).toBe(200)
  const token = login.body.token
  expect(token).toBeTruthy()

  // create cashier
  const newEmail = `cashier-${uniq()}@local`
  const create = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send({ username: `c-${uniq()}`, email: newEmail, password: 'Cash123!', role: 'cashier' })
  expect(create.status).toBe(200)
  expect(create.body.ok).toBeTruthy()
  const newUserId = create.body.id

  // verify role assigned
  const rr = await db.query('SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1', [newUserId])
  const roleNames = rr.rows.map(r => r.name)
  expect(roleNames).toContain('cashier')

  // cleanup
  await db.query('DELETE FROM user_roles WHERE user_id = ANY($1::int[])', [[userId, newUserId]])
  await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [[userId, newUserId]])
})

test('non-elevated user forbidden from creating users', async () => {
  const email = `user-${uniq()}@local`
  const password = 'User123!'
  const h = await bcrypt.hash(password, 8)
  const uRes = await db.query('INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id', [email, h, 'Regular User'])
  const userId = uRes.rows[0].id

  // login as regular user
  const login = await request(app).post('/api/auth/login').send({ email, password })
  expect(login.status).toBe(200)
  const token = login.body.token
  expect(token).toBeTruthy()

  // attempt to create cashier
  const create = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send({ username: `x-${uniq()}`, email: `x-${uniq()}@local`, password: 'Xpass123!', role: 'cashier' })
  // should be forbidden (403)
  expect([401,403]).toContain(create.status)

  // cleanup
  await db.query('DELETE FROM users WHERE id = $1', [userId])
})
