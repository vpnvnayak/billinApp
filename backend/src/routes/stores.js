const express = require('express')
const router = express.Router()
const db = require('../db')
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcrypt')

// POST /api/stores/register
router.post('/register', async (req, res) => {
  const { name, username, email, phone, password } = req.body || {}
  if (!name || !username || !email || !password) return res.status(400).json({ ok: false, error: 'name, username, email and password required' })

  // hash password
  let passwordHash = null
  try {
    passwordHash = await bcrypt.hash(password, 10)
  } catch (err) {
    console.error('password hashing failed', err)
    return res.status(500).json({ ok: false, error: 'failed to process password' })
  }

  // Try to insert into DB if table exists
  try {
  const pool = db.pool
    // check if stores table exists
    const q = `SELECT to_regclass('public.stores') as t`;
    const r = await pool.query(q)
    if (r.rows && r.rows.length && r.rows[0].t) {
      const insert = `INSERT INTO stores (name, username, email, phone, password_hash, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,now(),now()) RETURNING id`;
      const out = await pool.query(insert, [name, username, email, phone || null, passwordHash])
      return res.json({ ok: true, id: out.rows[0].id })
    }
  } catch (err) {
    console.warn('db stores insert failed, falling back to file:', err.message)
  }

  // fallback: write to data/stores.json
  try {
    const storesPath = path.join(__dirname, '..', '..', 'data', 'stores.json')
    let stores = []
    if (fs.existsSync(storesPath)) {
      const txt = fs.readFileSync(storesPath, 'utf8')
      stores = JSON.parse(txt || '[]')
    }
    const id = stores.length ? (Math.max(...stores.map(s => s.id || 0)) + 1) : 1
    const record = { id, name, username, email, phone: phone || null, password_hash: passwordHash, created_at: new Date().toISOString() }
    stores.push(record)
    fs.writeFileSync(storesPath, JSON.stringify(stores, null, 2), 'utf8')
    return res.json({ ok: true, id })
  } catch (err) {
    console.error('stores fallback write failed', err)
    return res.status(500).json({ ok: false, error: 'failed to persist store' })
  }
})

module.exports = router
