const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/invoice/next - returns next invoice number { invoice_no: 'GCK000001' }
router.get('/next', async (req, res) => {
  // If no DB configured, fall back to timestamp-based invoice
  if (!process.env.DATABASE_URL) {
    const n = Date.now() % 1000000
    const invoice = `GCK${String(n).padStart(6, '0')}`
    return res.json({ invoice_no: invoice })
  }

  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')
    // Ensure invoices table exists. It stores a serial id so we can use it as sequence.
    await client.query(`CREATE TABLE IF NOT EXISTS invoices (id bigserial primary key, created_at timestamptz default now())`)
    // Insert a row to get the next sequence value
    const r = await client.query(`INSERT INTO invoices DEFAULT VALUES RETURNING id`)
    const id = Number(r.rows[0].id || 0)
    await client.query('COMMIT')
    const invoice_no = `GCK${String(id).padStart(6, '0')}`
    res.json({ invoice_no })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('failed to generate invoice', err)
    res.status(500).json({ error: 'failed to generate invoice' })
  } finally {
    client.release()
  }
})

module.exports = router
