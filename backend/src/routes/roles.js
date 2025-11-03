const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

// GET /api/roles - list available roles
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT name, description FROM roles ORDER BY name')
    res.json(r.rows)
  } catch (err) {
    console.error('GET /api/roles failed', err)
    res.status(500).json({ error: 'internal error' })
  }
})

module.exports = router
