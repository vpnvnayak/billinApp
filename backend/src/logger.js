const db = require('./db')

// Simple rule-based classifier. Keep small and deterministic so it can run at insert time.
function classifyLog(message = '', meta = {}) {
  const mAction = (meta && (meta.action || meta.event || meta.eventType) || '').toString().toLowerCase()
  const text = (message || '').toString().toLowerCase()
  const source = `${mAction} ${text}`.trim()

  const rules = [
    { rx: /\b(pos|sale|checkout|processed sale|processed pos|sold)\b/, action: 'sale', severity: 'info' },
    { rx: /\b(purchase|received|restock|stock received|purchase order)\b/, action: 'purchase', severity: 'info' },
    { rx: /\b(stock|adjusted|adjustment|inventory)\b/, action: 'stock_adjust', severity: 'info' },
    { rx: /\b(customer created|created customer|new customer|customer created)\b/, action: 'customer_create', severity: 'info' },
    { rx: /\b(customer updated|updated customer)\b/, action: 'customer_update', severity: 'info' },
    { rx: /\b(product created|created product|new product)\b/, action: 'product_create', severity: 'info' },
    { rx: /\b(product updated|updated product|variant updated)\b/, action: 'product_update', severity: 'info' },
    { rx: /\b(deleted|remove|removed|deleted)\b/, action: 'delete', severity: 'warn' },
    { rx: /\b(login failed|failed login|authentication failed|invalid credentials)\b/, action: 'authentication_failed', severity: 'warn' },
    { rx: /\b(login succeeded|user login|authentication success)\b/, action: 'authentication', severity: 'info' },
    { rx: /\berror\b/, action: 'error', severity: 'error' }
  ]

  for (const r of rules) {
    if (r.rx.test(source)) return { action_type: r.action, severity: r.severity }
  }

  // fallback: use supplied meta.level or message presence
  if (meta && meta.level) return { action_type: meta.action || meta.event || '', severity: (meta.level || 'info') }
  return { action_type: '', severity: 'info' }
}

async function safeInsertLog({ level = 'info', message = '', meta = null, storeId = null }) {
  // classify using message/meta
  const { action_type, severity } = classifyLog(message, meta || {})

  try {
    // try insert including new columns; return inserted row
    const q = 'INSERT INTO system_logs (level, message, meta, store_id, action_type, severity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, level, message, meta, store_id, action_type, severity, created_at'
    const r = await db.query(q, [level, message, meta, storeId, action_type || null, severity || null])
    const row = r && r.rows && r.rows[0]
    // notify listeners (if any) with the new row as payload
    try {
      const payload = JSON.stringify(row || { level, message, meta, store_id: storeId, action_type, severity })
      // use pool to send NOTIFY; ignore errors
      if (db && db.pool && typeof db.pool.query === 'function') {
        try { await db.pool.query('NOTIFY system_logs_channel, $1', [payload]) } catch (nerr) { /* ignore notify errors */ }
      }
    } catch (nerr) {}
    return
  } catch (e) {
    // If table doesn't exist, bail silently
    if (e && e.code === '42P01') return
    // If columns missing (old schema without action_type/severity) fallback to prior insert
    if (e && e.code === '42703') {
      try {
        const q2 = 'INSERT INTO system_logs (level, message, meta, store_id) VALUES ($1,$2,$3,$4) RETURNING id, level, message, meta, store_id, created_at'
        const r2 = await db.query(q2, [level, message, meta, storeId])
        const row2 = r2 && r2.rows && r2.rows[0]
        try {
          const payload2 = JSON.stringify(row2 || { level, message, meta, store_id: storeId })
          if (db && db.pool && typeof db.pool.query === 'function') {
            try { await db.pool.query('NOTIFY system_logs_channel, $1', [payload2]) } catch (nerr) { /* ignore notify errors */ }
          }
        } catch (n) {}
        return
      } catch (inner) {
        if (inner && inner.code === '42P01') return
        try { console.warn('logger fallback: failed to write log to DB', inner && inner.message || inner) } catch (err) {}
        return
      }
    }

    try { console.warn('logger: failed to write log to DB', e && e.message || e) } catch (err) {}
  }
}

module.exports = {
  classify: classifyLog,
  info: async (msg, meta, storeId) => safeInsertLog({ level: 'info', message: String(msg || ''), meta: meta || null, storeId: storeId || null }),
  warn: async (msg, meta, storeId) => safeInsertLog({ level: 'warn', message: String(msg || ''), meta: meta || null, storeId: storeId || null }),
  error: async (msg, meta, storeId) => safeInsertLog({ level: 'error', message: String(msg || ''), meta: meta || null, storeId: storeId || null }),
  raw: safeInsertLog
}
