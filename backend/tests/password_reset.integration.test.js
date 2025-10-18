const request = require('supertest')
const app = require('../src/index')
const db = require('../src/db')
const bcrypt = require('bcrypt')

jest.setTimeout(20000)

afterAll(async () => {
  try { await db.pool.end() } catch (e) {}
})

test('password reset verify updates password and allows login', async () => {
  if (!process.env.DATABASE_URL) return
  const email = `pr-${Date.now()}@local`
  const oldPass = 'OldPass1!'
  const newPass = 'NewPass2!'
  const h = await bcrypt.hash(oldPass, 8)
  const uRes = await db.query('INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id', [email, h, 'PR Test'])
  const userId = uRes.rows[0].id

  // create a known OTP and insert a hashed token
  const otp = '123456'
  const otpHash = await bcrypt.hash(otp, 10)
  const expiresAt = new Date(Date.now() + 15*60*1000)
  await db.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [userId, otpHash, expiresAt])

  // verify reset using otp
  const verify = await request(app).post('/api/auth/verify-password-reset').send({ email, otp, password: newPass })
  expect(verify.status).toBe(200)

  // login with new password
  const login = await request(app).post('/api/auth/login').send({ email, password: newPass })
  expect(login.status).toBe(200)
  expect(login.body.token).toBeTruthy()

  // cleanup
  try { await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]) } catch (e) {}
  try { await db.query('DELETE FROM users WHERE id = $1', [userId]) } catch (e) {}
})
