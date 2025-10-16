const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/suppliers
router.get('/', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.json([])
    }
    // scope by store if available
    const hasStore = req.user && req.user.store_id
    let sql = 'SELECT id, name, phone, phone1, phone2, email, website, executive_name, address, city, tin_gstin, state, credit_due, created_at FROM suppliers'
    const params = []
    if (hasStore) {
      params.push(req.user.store_id)
      sql += ` WHERE store_id = $${params.length}`
    }
    sql += ' ORDER BY id DESC'
    const r = await db.query(sql, params)
    res.json(r.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/suppliers
router.post('/', async (req, res) => {
  try {
  const { name, phone, email, website, executive_name, phone1, phone2, address, city, tin_gstin, state, credit_due } = req.body || {}
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' })
    if (!process.env.DATABASE_URL) {
      return res.status(201).json({ id: Date.now(), name, phone: phone || null, email: email || null, website: website || null, executive_name: executive_name || null, phone1: phone1 || null, phone2: phone2 || null, address: address || null, city: city || null, tin_gstin: tin_gstin || null, state: state || null, credit_due: Number(credit_due) || 0 })
    }
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    const r = await db.query(
      `INSERT INTO suppliers (name, phone, email, website, executive_name, phone1, phone2, address, city, tin_gstin, state, credit_due, store_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, name, phone, phone1, phone2, email, website, executive_name, address, city, tin_gstin, state, credit_due, created_at`,
      [name, phone || null, email || null, website || null, executive_name || null, phone1 || null, phone2 || null, address || null, city || null, tin_gstin || null, state || null, Number(credit_due) || 0, storeId]
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/suppliers/:id
router.put('/:id', async (req, res) => {
  try {
  const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' })
    const { name, phone, email, website, executive_name, phone1, phone2, address, city, tin_gstin, state, credit_due } = req.body
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    // only update if the supplier belongs to this store (if store scoping is present)
    let r
    if (storeId) {
      r = await db.query(
        `UPDATE suppliers SET name=$1, phone=$2, email=$3, website=$4, executive_name=$5, phone1=$6, phone2=$7, address=$8, city=$9, tin_gstin=$10, state=$11, credit_due=$12 WHERE id=$13 AND store_id=$14 RETURNING id, name, phone, phone1, phone2, email, website, executive_name, address, city, tin_gstin, state, credit_due, created_at`,
        [name, phone || null, email || null, website || null, executive_name || null, phone1 || null, phone2 || null, address || null, city || null, tin_gstin || null, state || null, Number(credit_due) || 0, id, storeId]
      )
    } else {
      r = await db.query(
        `UPDATE suppliers SET name=$1, phone=$2, email=$3, website=$4, executive_name=$5, phone1=$6, phone2=$7, address=$8, city=$9, tin_gstin=$10, state=$11, credit_due=$12 WHERE id=$13 RETURNING id, name, phone, phone1, phone2, email, website, executive_name, address, city, tin_gstin, state, credit_due, created_at`,
        [name, phone || null, email || null, website || null, executive_name || null, phone1 || null, phone2 || null, address || null, city || null, tin_gstin || null, state || null, Number(credit_due) || 0, id]
      )
    }
    if (!r.rows.length) return res.status(404).json({ error: 'not found' })
    res.json(r.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/suppliers/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' })
    // respect store scoping when deleting
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    if (storeId) {
      await db.query('DELETE FROM suppliers WHERE id=$1 AND store_id=$2', [id, storeId])
    } else {
      await db.query('DELETE FROM suppliers WHERE id=$1', [id])
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router

