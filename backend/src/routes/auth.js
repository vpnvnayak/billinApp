const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');
const tx = require('../tx')
const { sendPasswordResetEmail } = require('../utils/email')

// Request password reset: POST /api/auth/request-password-reset { email }
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })
    const u = await db.query('SELECT id, email FROM users WHERE email = $1', [email])
    if (u.rows.length === 0) return res.json({ ok: true }) // don't leak existence
    const user = u.rows[0]
    // create a 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    // hash the otp for storage
    const hash = await bcrypt.hash(otp, 10)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    await db.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [user.id, hash, expiresAt])
    // send email (or log)
    try { await sendPasswordResetEmail(user.email, otp) } catch (e) { console.error('email send failed', e && e.message) }
    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Verify OTP and set new password: POST /api/auth/verify-password-reset { email, otp, password }
router.post('/verify-password-reset', async (req, res) => {
  try {
    const { email, otp, password } = req.body
    if (!email || !otp || !password) return res.status(400).json({ error: 'email, otp, and password required' })
    const u = await db.query('SELECT id FROM users WHERE email = $1', [email])
    if (u.rows.length === 0) return res.status(400).json({ error: 'invalid' })
    const userId = u.rows[0].id
    // find latest unused token for this user
    const tRes = await db.query('SELECT id, token_hash, expires_at, used FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5', [userId])
    if (tRes.rows.length === 0) return res.status(400).json({ error: 'invalid or expired' })
    // find a matching token
    let matched = null
    for (const row of tRes.rows) {
      if (row.used) continue
      if (row.expires_at && new Date(row.expires_at) < new Date()) continue
      const ok = await bcrypt.compare(otp, row.token_hash)
      if (ok) { matched = row; break }
    }
    if (!matched) return res.status(400).json({ error: 'invalid or expired' })
    // update password and mark token used in transaction
    await tx.runTransaction(async (client) => {
      const newHash = await bcrypt.hash(password, 10)
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId])
      await client.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [matched.id])
    }, { route: 'auth.verifyPasswordReset' })
    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Register (for admin/dev use)
router.post('/register', async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name',
      [email, hash, full_name || null]
    );

    const user = result.rows[0];
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
const NODE_ENV = process.env.NODE_ENV || 'development'
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const result = await db.query('SELECT id, email, password_hash, full_name FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // fetch roles
    const r = await db.query(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
      [user.id]
    );
  const roles = r.rows.map(x => x.name);
  // fetch store_id for the user so clients can scope requests
  const storeRow = await db.query('SELECT store_id FROM users WHERE id = $1', [user.id]);
  const store_id = (storeRow.rows[0] && storeRow.rows[0].store_id) || null

  const payload = { sub: user.id, email: user.email, roles, store_id };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
      // create a refresh token, store it with expiry, and set as HttpOnly cookie
      const refresh = crypto.randomBytes(48).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await db.query('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)', [refresh, user.id, expiresAt]);
  // set cookie (HttpOnly)
  // choose secure when connection is TLS or COOKIE_SECURE env is set
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  const cookieSecure = (process.env.COOKIE_SECURE === 'true') || req.secure || (req.get && req.get('x-forwarded-proto') === 'https')
  // Use SameSite=None only when cookie is secure (modern browsers require Secure for SameSite=None)
  const sameSite = cookieSecure ? 'none' : 'lax'
      res.cookie('refreshToken', refresh, { httpOnly: true, sameSite, secure: cookieSecure, domain: cookieDomain, expires: expiresAt });
      // In development include the refresh token in the response body to aid local dev (not secure)
      if (NODE_ENV !== 'production') {
        res.json({ token, refreshToken: refresh, user: { id: user.id, email: user.email, full_name: user.full_name, roles, store_id } });
      } else {
        res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, roles, store_id } });
      }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me - return current user (requires auth)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
  const result = await db.query('SELECT id, email, full_name, store_id FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const user = result.rows[0];
    const r = await db.query(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
      [user.id]
    );
    const roles = r.rows.map(x => x.name);
  res.json({ id: user.id, email: user.email, full_name: user.full_name, roles, store_id: user.store_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh access token
// Refresh via HttpOnly cookie; rotates refresh token
router.post('/refresh', async (req, res) => {
  try {
  // Accept refresh token from cookie (preferred) or from request body (dev fallback)
  const refreshToken = req.cookies.refreshToken || (req.body && req.body.refreshToken);
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });
    const r = await db.query('SELECT id, user_id, expires_at FROM refresh_tokens WHERE token = $1', [refreshToken]);
    if (r.rows.length === 0) return res.status(401).json({ error: 'Invalid refresh token' });
    const row = r.rows[0];
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      // expired: delete
      await db.query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    const userId = row.user_id;
    const u = await db.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (u.rows.length === 0) return res.status(401).json({ error: 'Invalid refresh token' });
  const rolesRes = await db.query('SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1', [userId]);
  const roles = rolesRes.rows.map(x => x.name);
  const storeRes = await db.query('SELECT store_id FROM users WHERE id = $1', [userId])
  const store_id = (storeRes.rows[0] && storeRes.rows[0].store_id) || null
  const payload = { sub: userId, email: u.rows[0].email, roles, store_id };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
    // rotate refresh token: delete old, insert new
    const newRefresh = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await tx.runTransaction(async (client) => {
      await client.query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
      await client.query('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)', [newRefresh, userId, expiresAt]);
    }, { route: 'auth.refresh' })
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  const cookieSecure = (process.env.COOKIE_SECURE === 'true') || req.secure || (req.get && req.get('x-forwarded-proto') === 'https')
  const sameSite = cookieSecure ? 'none' : 'lax'
    // set cookie when possible; include new refresh token in body in development for convenience
    res.cookie('refreshToken', newRefresh, { httpOnly: true, sameSite, secure: cookieSecure, domain: cookieDomain, expires: expiresAt });
    if (NODE_ENV !== 'production') {
      res.json({ token, refreshToken: newRefresh });
    } else {
      res.json({ token });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (revoke refresh token)
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }
  // clear cookie (use same options as when setting)
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  const cookieSecure = (process.env.COOKIE_SECURE === 'true') || req.secure || (req.get && req.get('x-forwarded-proto') === 'https')
  const sameSite = cookieSecure ? 'none' : 'lax'
  res.clearCookie('refreshToken', { httpOnly: true, sameSite, secure: cookieSecure, domain: cookieDomain });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;
