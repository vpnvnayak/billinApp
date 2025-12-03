const express = require('express')
const path = require('path')
const fs = require('fs')
const db = require('../../db')

const router = express.Router()

// Helper: save base64 image (data or raw base64) to uploads/posters and return public url
function saveBase64Image(base64, namePrefix) {
  if (!base64) return null
  // strip data url prefix if present
  const m = base64.match(/^data:(image\/(png|jpeg|jpg));base64,(.*)$/i)
  let ext = 'png'
  let data = base64
  if (m) {
    ext = m[2] === 'jpeg' ? 'jpg' : m[2]
    data = m[3]
  } else {
    // try to detect simple prefix
    const sp = base64.substring(0, 30)
    if (sp.indexOf('/9j/') !== -1) ext = 'jpg'
  }
  const buf = Buffer.from(data, 'base64')
  const filename = `${Date.now()}-${namePrefix || 'poster'}.${ext}`
  const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'posters')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
  const filePath = path.join(uploadsDir, filename)
  fs.writeFileSync(filePath, buf)
  // public URL path (server serves /uploads)
  return `/uploads/posters/${filename}`
}

// List posters
router.get('/posters', async (req, res) => {
  try {
    const r = await db.query('SELECT id, title, subtitle, created_by, created_at, templates FROM posters ORDER BY created_at DESC')
    const rows = r.rows.map(row => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      created_by: row.created_by,
      created_at: row.created_at,
      templates: row.templates || []
    }))
    res.json(rows)
  } catch (err) {
    console.error('GET /posters failed', err)
    res.status(500).json({ error: 'failed' })
  }
})

// Get single poster
router.get('/posters/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const r = await db.query('SELECT * FROM posters WHERE id = $1', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'not found' })
    res.json(r.rows[0])
  } catch (err) {
    console.error('GET /posters/:id failed', err)
    res.status(500).json({ error: 'failed' })
  }
})

// Create poster. Expected payload:
// { title, subtitle, items: [...], templates: [{ name, data (base64) }] }
router.post('/posters', async (req, res) => {
  try {
    const { title, subtitle, items = [], templates = [], meta } = req.body || {}
    if (!title) return res.status(400).json({ error: 'title required' })

    const savedTemplates = []
    for (const t of templates || []) {
      try {
        const url = saveBase64Image(t.data || t.base64 || t.src || '', t.name || 'tpl')
        if (url) savedTemplates.push({ name: t.name || 'template', url })
      } catch (e) {
        console.warn('Failed to save template image', e)
      }
    }

    const createdBy = req.user && req.user.id ? req.user.id : null
    const r = await db.query(
      'INSERT INTO posters (title, subtitle, created_by, items, templates, meta) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, subtitle || null, createdBy, JSON.stringify(items || []), JSON.stringify(savedTemplates), meta || null]
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    console.error('POST /posters failed', err)
    res.status(500).json({ error: 'failed' })
  }
})

// Delete poster and files
router.delete('/posters/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const r = await db.query('SELECT templates FROM posters WHERE id = $1', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'not found' })
    const templates = r.rows[0].templates || []
    // remove files
    for (const t of templates) {
      try {
        const p = path.join(__dirname, '..', '..', 'public', t.url.replace(/^\/uploads\//, 'uploads/'))
        if (fs.existsSync(p)) fs.unlinkSync(p)
      } catch (e) {}
    }
    await db.query('DELETE FROM posters WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /posters/:id failed', err)
    res.status(500).json({ error: 'failed' })
  }
})

// Update poster (title, subtitle, items, optionally templates)
router.put('/posters/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { title, subtitle, items = [], templates = null, meta } = req.body || {}

    const r0 = await db.query('SELECT templates FROM posters WHERE id = $1', [id])
    if (!r0.rows.length) return res.status(404).json({ error: 'not found' })

    let existingTemplates = r0.rows[0].templates || []
    let savedTemplates = existingTemplates

    // If templates provided (array), replace existing templates with newly saved ones
    if (Array.isArray(templates)) {
      // remove old files
      for (const t of existingTemplates) {
        try {
          const p = path.join(__dirname, '..', '..', 'public', t.url.replace(/^\//, ''))
          if (fs.existsSync(p)) fs.unlinkSync(p)
        } catch (e) {}
      }

      savedTemplates = []
      for (const t of templates || []) {
        try {
          const url = saveBase64Image(t.data || t.base64 || t.src || '', t.name || 'tpl')
          if (url) savedTemplates.push({ name: t.name || 'template', url })
        } catch (e) {
          console.warn('Failed to save template image', e)
        }
      }
    }

    const updateRes = await db.query(
      'UPDATE posters SET title=$1, subtitle=$2, items=$3, templates=$4, meta=$5 WHERE id=$6 RETURNING *',
      [title || null, subtitle || null, JSON.stringify(items || []), JSON.stringify(savedTemplates), meta || null, id]
    )

    res.json(updateRes.rows[0])
  } catch (err) {
    console.error('PUT /posters/:id failed', err)
    res.status(500).json({ error: 'failed' })
  }
})

module.exports = router
