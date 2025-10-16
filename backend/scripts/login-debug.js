// Simple debug script to POST to /api/auth/login and print response headers and body
// Usage: node scripts/login-debug.js

const db = require('../src/db')

(async function() {
  try {
    // allow self-signed certs for local dev
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    const url = process.env.BASE_URL || 'https://localhost:4000'
    const email = process.env.DEBUG_EMAIL || 'admin@local'
    const password = process.env.DEBUG_PASSWORD || 'Admin123!'
    console.log('Posting login to', url + '/api/auth/login')

    const resp = await fetch(url + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      // fetch in node doesn't attach cookies by default; we only need response headers here
    })
    console.log('Status:', resp.status)
    // print set-cookie header if present
    const setCookie = resp.headers.get('set-cookie')
    console.log('Set-Cookie:', setCookie)
    const body = await resp.text()
    console.log('Body:', body)

    // check refresh_tokens rows
    const r = await db.query('SELECT id, token, user_id, created_at, expires_at FROM refresh_tokens ORDER BY id DESC LIMIT 5')
    console.log('refresh_tokens rows:', r.rows.length)
    for (const row of r.rows) console.log(row)
  } catch (e) {
    console.error('error', e && e.message)
  }
})()
