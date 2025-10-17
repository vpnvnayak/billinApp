const express = require('express')
const router = express.Router()

// Development-only helper: echo received cookies/headers to help debug refresh/login flows
router.get('/cookies', (req, res) => {
  try {
    return res.json({ cookies: req.cookies || {}, cookieHeader: req.headers && req.headers.cookie })
  } catch (e) {
    console.error('debug/cookies error', e)
    return res.status(500).json({ error: 'internal' })
  }
})

module.exports = router
