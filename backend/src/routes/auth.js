const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');
const tx = require('../tx')

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
  // set cookie (HttpOnly) with secure production defaults
  const cookieSecure = process.env.COOKIE_SECURE === 'true';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  const sameSite = (process.env.NODE_ENV === 'production') ? 'strict' : 'lax'
  res.cookie('refreshToken', refresh, { httpOnly: true, sameSite, secure: cookieSecure, domain: cookieDomain, expires: expiresAt });
      res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, roles, store_id } });
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
    const refreshToken = req.cookies.refreshToken;
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
  const cookieSecure = process.env.COOKIE_SECURE === 'true';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  const sameSite = (process.env.NODE_ENV === 'production') ? 'strict' : 'lax'
  res.cookie('refreshToken', newRefresh, { httpOnly: true, sameSite, secure: cookieSecure, domain: cookieDomain, expires: expiresAt });
    res.json({ token });
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
  const sameSite = (process.env.NODE_ENV === 'production') ? 'strict' : 'lax'
  res.clearCookie('refreshToken', { httpOnly: true, sameSite, secure: process.env.COOKIE_SECURE === 'true', domain: cookieDomain });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;
