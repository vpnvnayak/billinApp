#!/usr/bin/env node
// login-debug-axios.js - use axios to POST login and show Set-Cookie and DB rows
const axios = require('axios')
const https = require('https')
const db = require('../src/db')

(async function() {
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    const url = process.env.BASE_URL || 'https://localhost:4000'
    const email = process.env.DEBUG_EMAIL || 'admin@local'
    const password = process.env.DEBUG_PASSWORD || 'Admin123!'
    console.log('Posting login to', url + '/api/auth/login')

    const agent = new https.Agent({ rejectUnauthorized: false })
    const resp = await axios.post(url + '/api/auth/login', { email, password }, { httpsAgent: agent, maxRedirects: 0, validateStatus: null })
    console.log('Status:', resp.status)
    console.log('Headers:', resp.headers)
    if (resp.headers['set-cookie']) console.log('Set-Cookie present:', resp.headers['set-cookie'])
    else console.log('No Set-Cookie header in response')
    console.log('Body:', resp.data)

    const r = await db.query('SELECT id, token, user_id, created_at, expires_at FROM refresh_tokens ORDER BY id DESC LIMIT 5')
    console.log('refresh_tokens rows:', r.rows.length)
    for (const row of r.rows) console.log(row)
  } catch (e) {
    console.error('error', e && e.message)
    if (e.response) {
      console.error('resp headers', e.response.headers)
      try { console.error('resp body', e.response.data) } catch (er) {}
    }
  }
})()
