const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const router = express.Router()

// optional DB helper (postgres)
let db = null
try {
  db = require('../db')
} catch (e) {
  // no db configured
}

const DATA_DIR = path.join(__dirname, '..', '..', 'data')
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public')
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

// ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true })
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// file fallback helpers
function readSettingsFromFile() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    console.error('readSettingsFromFile error', e)
    return null
  }
}

function writeSettingsToFile(obj) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2), 'utf8')
    return true
  } catch (e) {
    console.error('writeSettingsToFile error', e)
    return false
  }
}

// DB-backed helpers (async)
async function readSettingsFromDB(storeId = null) {
  if (!db) return null
  try {
    // If a storeId is provided, attempt to read the store-specific row. Otherwise read global id=1
    const q = storeId ? 'SELECT * FROM store_settings WHERE store_id = $1' : 'SELECT * FROM store_settings WHERE id = $1'
    const p = storeId ? [storeId] : [1]
    const r = await db.query(q, p)
    if (!r || !r.rows || !r.rows[0]) return null
    const row = r.rows[0]

    // Only return fields that exist in the row (protect against missing columns)
    const allowed = [
      'name','address','contact','gst_id','bank_name','bank_branch','account_no','ifsc','account_name',
      'website','tax_rate','timezone','logo_url'
    ]
    const out = {}
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(row, k) && row[k] !== undefined) {
        out[k] = row[k]
      }
    }
    // business hours removed, nothing to parse
    return out
  } catch (e) {
    console.warn('readSettingsFromDB failed', e)
    return null
  }
}

async function writeSettingsToDB(obj) {
  if (!db) return false
  try {
    // Determine which columns actually exist in the store_settings table so we don't reference missing columns
    const schemaCache = require('../schemaCache')
    const dbCols = new Set()
    // if schema cache initialized, use it; otherwise fallback to querying information_schema
    if (schemaCache.cache && schemaCache.cache.initialized) {
      const cols = schemaCache.cache.columns['store_settings'] || new Set()
      for (const c of cols) dbCols.add(c)
    } else {
      try {
        const colsRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'store_settings'")
        for (const r of (colsRes.rows || [])) dbCols.add(r.column_name)
      } catch (e) {
        console.warn('writeSettingsToDB: failed to query information_schema, proceeding with file fallback')
      }
    }

    // allowed mapping of fields we may write
    const allowed = ['name','address','contact','gst_id','bank_name','bank_branch','account_no','ifsc','account_name','website','tax_rate','timezone','hours','logo_url']

    // build columns list based on intersection of allowed fields and actual db columns
    // By default we write to id=1 (global). The route handler can set obj._store_id to target a store row.
    const insertCols = ['id']
    const values = [1]
    const placeholders = ['$1']

    const storeId = obj && obj._store_id ? obj._store_id : null
    if (storeId) {
      insertCols[0] = 'store_id'
      values[0] = storeId
      placeholders[0] = '$1'
    }

    let idx = 2
    for (const key of allowed) {
      if (dbCols.has(key) && Object.prototype.hasOwnProperty.call(obj, key)) {
        insertCols.push(key)
        placeholders.push(`$${idx}`)
        if (key === 'hours') values.push(obj.hours ? JSON.stringify(obj.hours) : null)
        else values.push(obj[key] || null)
        idx += 1
      }
    }

    // Always try to set updated_at if present in DB (or else skip)
    if (dbCols.has('updated_at')) {
      insertCols.push('updated_at')
      placeholders.push('now()')
    }

    // Build ON CONFLICT update assignments for columns that exist (excluding id)
    const updateAssignments = insertCols.filter(c => c !== 'id' && c !== 'updated_at').map(c => `${c}=EXCLUDED.${c}`)
    if (dbCols.has('updated_at')) updateAssignments.push('updated_at=now()')

    if (insertCols.length <= 1) {
      // nothing to write besides id
      console.warn('writeSettingsToDB: no writable columns found in store_settings table. Skipping DB write.')
      return false
    }

    // Build appropriate conflict target: if using store_id as primary key, conflict on store_id
    let q
    // Some older DBs may not have a unique constraint on store_id (or id) which makes
    // the `ON CONFLICT (<col>)` clause fail with Postgres error 42P10. To be resilient
    // we'll try an UPDATE first. If the UPDATE affects 0 rows, fall back to INSERT.
    // This avoids relying on a specific unique constraint existing while keeping
    // idempotent upsert behavior.
    const conflictTarget = insertCols[0] === 'store_id' ? 'store_id' : 'id'
    const updateCols = updateAssignments.join(', ')

    // Build a simple UPDATE statement matching on the conflict target
    const updateSet = updateAssignments.map(a => {
      // a looks like "col=EXCLUDED.col"; convert to "col=$n" placeholders below
      const col = a.split('=')[0]
      return col + ' = EXCLUDED.' + col
    }).map((s, i) => s).join(', ')

    // First try an UPDATE using the values we already built. We'll map the placeholders
    // to positional parameters for the UPDATE statement. We need a WHERE clause on the
    // conflict target.
    // helper: build an INSERT statement that can optionally use DEFAULT for id
    function buildSafeInsert(cols, vals, useDefaultId) {
      // cols: array of column names (as in insertCols)
      // vals: array of values corresponding to cols (same length)
      // useDefaultId: if true and 'id' is not present, we will prepend id and use DEFAULT for it
      const resultCols = cols.slice()
      const params = []
      const parts = []
      let paramIdx = 1
      if (useDefaultId) {
        if (!resultCols.includes('id')) {
          resultCols.unshift('id')
        }
      }
      for (let i = 0; i < resultCols.length; i++) {
        const col = resultCols[i]
        if (col === 'id' && useDefaultId) {
          parts.push('DEFAULT')
        } else {
          parts.push(`$${paramIdx}`)
          // map to the original vals: find index in original cols
          // original vals correspond to `cols` passed in; compute original index
          // If we prepended id, then original vals map to resultCols indices shifted by 1
          const originalIndex = useDefaultId && !cols.includes('id') ? i - 1 : i
          params.push(vals[originalIndex])
          paramIdx += 1
        }
      }
      const sql = `INSERT INTO store_settings (${resultCols.join(',')}) VALUES (${parts.join(',')})`
      return { sql, params }
    }

    try {
      // Build UPDATE ... SET col=$n WHERE <conflictTarget> = $1
      const updCols = insertCols.filter(c => c !== conflictTarget && c !== 'updated_at')
      const updAssignments = []
      const updValues = []
      let paramIdx = 1
      // For UPDATE, the first parameter is the conflict target value
      updValues.push(values[0])
      paramIdx = 2
      for (let i = 0; i < insertCols.length; i++) {
        const col = insertCols[i]
        if (col === conflictTarget || col === 'updated_at') continue
        // find corresponding value index in `values` array
        const val = values[i]
        updAssignments.push(`${col} = $${paramIdx}`)
        updValues.push(val)
        paramIdx += 1
      }
      if (dbCols.has('updated_at')) {
        updAssignments.push('updated_at = now()')
      }

      const updateQ = `UPDATE store_settings SET ${updAssignments.join(', ')} WHERE ${conflictTarget} = $1`
      const updateRes = await db.query(updateQ, updValues)
      if (updateRes && updateRes.rowCount && updateRes.rowCount > 0) {
        // success via UPDATE
      } else {
        // Nothing updated, perform INSERT (as a fallback). Use the original INSERT + ON CONFLICT
        // but wrap in try/catch to surface a clearer message if it still fails.
        try {
          if (conflictTarget === 'store_id') {
            q = `INSERT INTO store_settings (${insertCols.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (store_id) DO UPDATE SET ${updateCols}`
          } else {
            q = `INSERT INTO store_settings (${insertCols.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (id) DO UPDATE SET ${updateCols}`
          }
          await db.query(q, values)
        } catch (insErr) {
          // If INSERT with ON CONFLICT failed (likely due to missing constraint),
          // try a plain INSERT but ensure we don't insert NULL into `id`.
          // For store-scoped inserts (conflictTarget === 'store_id'), use DEFAULT
          // for the id column so the sequence/default is applied. We build a
          // safe INSERT that uses DEFAULT for id when appropriate.
          console.warn('writeSettingsToDB: INSERT with ON CONFLICT failed, retrying plain INSERT', insErr && insErr.message)
          const useDefaultId = (conflictTarget === 'store_id')
          const { sql: plainQ, params: plainValues } = buildSafeInsert(insertCols, values, useDefaultId)
          await db.query(plainQ, plainValues)
        }
      }
    } catch (e) {
      // An UPDATE may fail if columns or types are incompatible; surface a clearer message
      console.warn('writeSettingsToDB: UPDATE attempt failed, falling back to INSERT. Error:', e && e.message)
      // As a last resort, try the INSERT path
      try {
        if (conflictTarget === 'store_id') {
          q = `INSERT INTO store_settings (${insertCols.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (store_id) DO UPDATE SET ${updateCols}`
        } else {
          q = `INSERT INTO store_settings (${insertCols.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (id) DO UPDATE SET ${updateCols}`
        }
        await db.query(q, values)
      } catch (e2) {
        // If the ON CONFLICT fallback also fails, try a safer INSERT that uses DEFAULT for id when
        // inserting store-scoped rows.
        console.warn('writeSettingsToDB failed during fallback INSERT/ON CONFLICT, trying safe INSERT', e2 && e2.message)
        try {
          const useDefaultId = (conflictTarget === 'store_id')
          const { sql: safeQ, params: safeValues } = buildSafeInsert(insertCols, values, useDefaultId)
          await db.query(safeQ, safeValues)
        } catch (e3) {
          console.warn('writeSettingsToDB failed during safe INSERT', e3)
          throw e3
        }
      }
    }
    // If some allowed fields were not present in DB, warn to run migration so future writes persist fully
    const missing = allowed.filter(k => !dbCols.has(k))
    if (missing.length) {
      console.warn('writeSettingsToDB: some settings columns are missing in DB and were skipped:', missing.join(', '), ' - run migrations to add them')
    }
    return true
  } catch (e) {
    console.warn('writeSettingsToDB failed', e)
    return false
  }
}

// unified helpers (use DB if available, fallback to file)
async function readSettings() {
  if (db) {
    // prefer reading global settings by default
    const s = await readSettingsFromDB()
    if (s) return s
  }
  return readSettingsFromFile()
}

async function writeSettings(obj) {
  if (db) {
    const ok = await writeSettingsToDB(obj)
    if (ok) return true
    // fall through to file fallback
  }
  return writeSettingsToFile(obj)
}

// GET /api/settings
router.get('/settings', async (req, res) => {
  // if authenticated and scoped to a store, read settings for that store
  const storeId = req.user && req.user.store_id ? req.user.store_id : null
  const s = db ? (await readSettingsFromDB(storeId)) : await readSettings()
  if (!s) return res.json({})
  res.json(s)
})

// POST /api/settings
router.post('/settings', async (req, res) => {
  const body = req.body || {}
  // whitelist allowed settings keys to avoid accidental DB writes
  const allowedKeys = new Set(['name','address','contact','gst_id','bank_name','bank_branch','account_no','ifsc','account_name','website','tax_rate','timezone','hours','logo_url'])
  for (const k of Object.keys(body)) {
    if (!allowedKeys.has(k)) return res.status(400).json({ error: `invalid setting key: ${k}` })
  }
  // merge existing
  // prefer store-specific write when authenticated
  const storeId = req.user && req.user.store_id ? req.user.store_id : null
  let cur = {}
  if (db) {
    cur = (await readSettingsFromDB(storeId)) || {}
  } else {
    cur = (await readSettings()) || {}
  }
  const merged = { ...cur, ...body }
  if (storeId) merged._store_id = storeId
  const ok = await writeSettingsToDB(merged)
  if (!ok) return res.status(500).json({ error: 'Failed to save settings' })
  res.json(merged)
})

// Simple uploads endpoint for logo
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR) },
  filename: function (req, file, cb) {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-z0-9.\-]/gi, '_')
    cb(null, safe)
  }
})
const upload = multer({ storage })

router.post('/uploads/logo', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    // return a relative URL to the uploads folder
    const url = `/uploads/${req.file.filename}`
    // Persist logo_url into settings (DB preferred)
    const cur = (await readSettings()) || {}
    cur.logo_url = url
    await writeSettings(cur)
    res.json({ url })
  } catch (e) {
    console.error('upload logo failed', e)
    res.status(500).json({ error: 'Upload failed' })
  }
})

// GET /api/ifsc/:code -> proxy to a free IFSC API (Razorpay) to fetch bank details
router.get('/ifsc/:code', async (req, res) => {
  try {
    const code = (req.params.code || '').toUpperCase().trim()
    if (!code || code.length !== 11) return res.status(400).json({ error: 'Invalid IFSC' })
    // use public Razorpay IFSC API
    const url = `https://ifsc.razorpay.com/${encodeURIComponent(code)}`
    const resp = await fetch(url)
    if (!resp.ok) {
      return res.status(404).json({ error: 'IFSC not found' })
    }
    const data = await resp.json()
    // return only useful fields
    return res.json({ ifsc: data.IFSC, bank: data.BANK, branch: data.BRANCH, address: data.ADDRESS, city: data.CITY, state: data.STATE })
  } catch (e) {
    console.error('ifsc lookup failed', e)
    return res.status(500).json({ error: 'Lookup failed' })
  }
})

// Export router as the default export, and also expose internal helpers for testing
module.exports = router
module.exports.writeSettingsToDB = writeSettingsToDB
module.exports.readSettingsFromDB = readSettingsFromDB
