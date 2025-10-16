const express = require('express')
const router = express.Router()
const db = require('../db')
const bcrypt = require('bcrypt')
const v = require('../validators')
const tx = require('../tx')

// POST /api/stores/register
// Accepts: { name, username, email, phone, password }
router.post('/register', async (req, res) => {
  const { name, username, email, phone, password } = req.body || {}
  if (!name || !username || !email || !password) return res.status(400).json({ ok: false, error: 'name, username, email and password required' })

  // basic sanitization using shared validators
  if (!v.isValidUsername(username)) return res.status(400).json({ ok: false, error: 'invalid username' })
  if (!v.isValidEmail(email)) return res.status(400).json({ ok: false, error: 'invalid email' })

  try {
    // quick pre-check to provide a friendly error message before doing heavy work
    const dup = await db.query('SELECT id, email, username FROM users WHERE email = $1 OR username = $2 LIMIT 1', [email, username])
    if (dup.rows && dup.rows.length) {
      const existing = dup.rows[0]
      if (existing.email === email) return res.status(400).json({ ok: false, error: 'email already exists' })
      if (existing.username === username) return res.status(400).json({ ok: false, error: 'username already exists' })
    }
  } catch (err) {
    console.error('pre-check failed', err.message || err)
    // continue to attempt registration; later unique constraint will catch duplicates
  }

  try {
    const result = await tx.runTransaction(async (client) => {
      // create store
      const storeIns = await client.query('INSERT INTO stores (name, created_at, updated_at) VALUES ($1, now(), now()) RETURNING id', [name])
      const storeId = storeIns.rows[0].id

      // create user with hashed password
      const pwHash = await bcrypt.hash(password, 10)
      const userIns = await client.query(
        'INSERT INTO users (email, password_hash, full_name, username, phone, store_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING id',
        [email, pwHash, null, username, phone || null, storeId]
      )
      const userId = userIns.rows[0].id

      // assign storeadmin role (create role if missing)
      const roleRes = await client.query('SELECT id FROM roles WHERE name = $1', ['storeadmin'])
      if (roleRes.rows.length === 0) {
        const r2 = await client.query('INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING id', ['storeadmin', 'Store administrator'])
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, r2.rows[0].id])
      } else {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleRes.rows[0].id])
      }

      return { storeId, userId }
    }, { route: 'register' })

    return res.json({ ok: true, storeId: result.storeId, userId: result.userId })
  } catch (err) {
    // handle unique constraint errors gracefully (Postgres 23505)
    if (err && err.code === '23505') {
      const detail = err.detail || ''
      if (detail.includes('username')) return res.status(400).json({ ok: false, error: 'username already exists' })
      if (detail.includes('email')) return res.status(400).json({ ok: false, error: 'email already exists' })
      return res.status(400).json({ ok: false, error: 'duplicate value' })
    }
    console.error('registration failed', err.message || err)
    return res.status(500).json({ ok: false, error: 'registration failed' })
  }
})

module.exports = router
