const db = require('../src/db')
;(async () => {
  try {
    const r = await db.query("SELECT to_regclass('public.stores') as t")
    console.log('to_regclass:', r.rows[0])
    if (r.rows[0] && r.rows[0].t) {
      const rows = await db.query('SELECT id, name, username, email, phone, created_at FROM stores ORDER BY id DESC LIMIT 20')
      console.log('rows:', rows.rows)
    }
  } catch (e) {
    console.error('failed', e.message || e)
  } finally { process.exit(0) }
})()
