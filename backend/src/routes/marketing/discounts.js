const express = require('express')
const router = express.Router()
const db = require('../../db')

// List discounts
router.get('/discounts', async (req, res) => {
  try {
    const r = await db.query('SELECT id, title, items, created_by, created_at, meta FROM marketing_discounts ORDER BY created_at DESC')
    res.json(r.rows || [])
  } catch (e) {
    console.error('GET /discounts failed', e)
    res.status(500).json({ error: 'failed' })
  }
})

// Get single
router.get('/discounts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const r = await db.query('SELECT * FROM marketing_discounts WHERE id = $1', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'not found' })
    res.json(r.rows[0])
  } catch (e) {
    console.error('GET /discounts/:id failed', e)
    res.status(500).json({ error: 'failed' })
  }
})

// Create
router.post('/discounts', async (req, res) => {
  try {
    const { title, items = [], meta } = req.body || {}
    if (!title) return res.status(400).json({ error: 'title required' })
    const createdBy = req.user && req.user.id ? req.user.id : null
    const r = await db.query(
      'INSERT INTO marketing_discounts (title, items, created_by, meta) VALUES ($1,$2,$3,$4) RETURNING *',
      [title, JSON.stringify(items || []), createdBy, meta || null]
    )
    res.status(201).json(r.rows[0])
  } catch (e) {
    console.error('POST /discounts failed', e)
    res.status(500).json({ error: 'failed' })
  }
})

// Delete
router.delete('/discounts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const r = await db.query('DELETE FROM marketing_discounts WHERE id = $1', [id])
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true })
  } catch (e) {
    console.error('DELETE /discounts/:id failed', e)
    res.status(500).json({ error: 'failed' })
  }
})

module.exports = router
