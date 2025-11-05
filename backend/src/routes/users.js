const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const bcrypt = require('bcrypt')
const crypto = require('crypto')

// helper to check elevated admin/store roles
function isElevated(roles) {
  if (!roles || !Array.isArray(roles)) return false
  return roles.includes('superadmin') || roles.includes('storeadmin') || roles.includes('admin')
}

// List users (admin/storeadmin/superadmin only)
router.get('/', requireAuth, async (req, res) => {
  if (!isElevated(req.user && req.user.roles)) return res.status(403).json({ error: 'Forbidden' })
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50))
    const offset = (page - 1) * limit
    // Return users with an aggregated array of role names
    // Superadmin sees all users; other admins see only users for their store
    const isSuper = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('superadmin')
    if (isSuper) {
      const inner = `
        SELECT u.id, u.email, u.username, u.phone, u.full_name, u.created_at,
               COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        GROUP BY u.id
      `
      const sql = `SELECT t.*, COUNT(*) OVER() AS total_count FROM (${inner}) t ORDER BY t.id DESC LIMIT $1 OFFSET $2`
      const r = await db.query(sql, [limit, offset])
      const total = r.rows.length ? Number(r.rows[0].total_count || 0) : 0
      const rows = r.rows.map(rr => { const { total_count, ...rest } = rr; return rest })
      return res.json({ data: rows, total })
    }

    // non-super admins: scope to store
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    if (!storeId) return res.status(403).json({ error: 'Forbidden' })
    const inner = `
      SELECT u.id, u.email, u.username, u.phone, u.full_name, u.created_at,
             COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.store_id = $1
      GROUP BY u.id
    `
    const sql = `SELECT t.*, COUNT(*) OVER() AS total_count FROM (${inner}) t ORDER BY t.id DESC LIMIT $2 OFFSET $3`
    const r = await db.query(sql, [storeId, limit, offset])
    const total = r.rows.length ? Number(r.rows[0].total_count || 0) : 0
    const rows = r.rows.map(rr => { const { total_count, ...rest } = rr; return rest })
    res.json({ data: rows, total })
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign role to user (admin/storeadmin/superadmin only)
router.post('/:id/roles', requireAuth, async (req, res) => {
  if (!isElevated(req.user && req.user.roles)) return res.status(403).json({ error: 'Forbidden' })
  const { id } = req.params;
  const { role } = req.body || {};
  const uid = Number(id);
  if (!Number.isInteger(uid) || uid <= 0) return res.status(400).json({ error: 'invalid user id' });
  if (!role || typeof role !== 'string') return res.status(400).json({ error: 'role is required' });
  try {
    const r = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (r.rows.length === 0) return res.status(400).json({ error: 'Unknown role' });
    const roleId = r.rows[0].id;
    await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [uid, roleId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove role from user (admin/storeadmin/superadmin only)
router.delete('/:id/roles/:role', requireAuth, async (req, res) => {
  if (!isElevated(req.user && req.user.roles)) return res.status(403).json({ error: 'Forbidden' })
  const { id, role } = req.params;
  try {
    const r = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (r.rows.length === 0) return res.status(400).json({ error: 'Unknown role' });
    const roleId = r.rows[0].id;
    await db.query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2', [id, roleId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
// Create a new user (admin/storeadmin/superadmin only)
// POST /api/users
// Body: { username, email, phone, password, roles: ['cashier', ...] }
router.post('/', requireAuth, async (req, res) => {
  if (!isElevated(req.user && req.user.roles)) return res.status(403).json({ error: 'Forbidden' })
  const { username, email, phone, password } = req.body || {}
  const requestedRoles = Array.isArray(req.body.roles) ? req.body.roles.map(r => String(r).trim()) : (req.body.role ? [String(req.body.role).trim()] : ['cashier'])
  if (!username || !email) return res.status(400).json({ error: 'username and email required' })
  try {
    // password: use provided if present, otherwise generate a temporary one
    let pw = password && typeof password === 'string' && password.trim() ? password.trim() : null
    if (pw && pw.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' })
    if (!pw) pw = crypto.randomBytes(4).toString('hex') // 8 chars
    const hash = await bcrypt.hash(pw, 10)
    // determine store scope: storeadmin => assign to their store; superadmin can optionally provide store_id
    let storeId = null
    const roles = (req.user && req.user.roles) || []
    if (roles.includes('storeadmin')) storeId = req.user && req.user.store_id ? req.user.store_id : null
    if (roles.includes('superadmin') && req.body.store_id) storeId = req.body.store_id

  const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      const ins = await client.query('INSERT INTO users (email, password_hash, full_name, username, phone, store_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING id, email, username', [email, hash, null, username, phone || null, storeId])
      const userId = ins.rows[0].id
      // enforce and assign requested roles
      const requestingRoles = (req.user && req.user.roles) || []
      for (const requestedRole of requestedRoles) {
        // enforce policy per role
        if (requestingRoles.includes('superadmin')) {
          // allowed
        } else if (requestingRoles.includes('storeadmin')) {
          if (requestedRole !== 'cashier' && requestedRole !== 'storeadmin') {
            await client.query('ROLLBACK')
            return res.status(403).json({ error: 'Forbidden to assign requested role' })
          }
        } else if (requestingRoles.includes('admin')) {
          if (requestedRole !== 'cashier') {
            await client.query('ROLLBACK')
            return res.status(403).json({ error: 'Forbidden to assign requested role' })
          }
        } else {
          await client.query('ROLLBACK')
          return res.status(403).json({ error: 'Forbidden to assign requested role' })
        }
        // ensure role exists
        const r = await client.query('SELECT id FROM roles WHERE name = $1', [requestedRole])
        let roleId
        if (r.rows.length === 0) {
          const r2 = await client.query('INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING id', [requestedRole, requestedRole.charAt(0).toUpperCase() + requestedRole.slice(1)])
          roleId = r2.rows[0].id
        } else {
          roleId = r.rows[0].id
        }
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, roleId])
      }
      await client.query('COMMIT')
      return res.json({ ok: true, id: userId, email: ins.rows[0].email, username: ins.rows[0].username, password: pw })
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('create user failed', err)
    if (err && err.code === '23505') return res.status(400).json({ error: 'duplicate user' })
    return res.status(500).json({ error: 'failed to create user' })
  }
})

// Update a user (PUT /api/users/:id) - update profile, optional password, and roles
router.put('/:id', requireAuth, async (req, res) => {
  if (!isElevated(req.user && req.user.roles)) return res.status(403).json({ error: 'Forbidden' })
  const uid = Number(req.params.id)
  if (!Number.isInteger(uid) || uid <= 0) return res.status(400).json({ error: 'invalid user id' })
  try {
    // load target user to check store scope
    const rUser = await db.query('SELECT id, store_id FROM users WHERE id = $1', [uid])
    if (rUser.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    const target = rUser.rows[0]
    const isSuper = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('superadmin')
    const isStoreAdmin = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('storeadmin')
    if (!isSuper && isStoreAdmin) {
      // ensure same store
      if (!req.user.store_id || req.user.store_id !== target.store_id) return res.status(403).json({ error: 'Forbidden' })
    }
    const { username, email, phone, password } = req.body || {}
    const requestedRoles = Array.isArray(req.body.roles) ? req.body.roles.map(r => String(r).trim()) : null
  const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      if (password) {
        if (typeof password !== 'string' || password.length < 6) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: 'password must be at least 6 characters' })
        }
        const hash = await bcrypt.hash(password, 10)
        await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, uid])
      }
      if (username || email || phone) {
        const parts = []
        const vals = []
        let i = 1
        if (username) { parts.push(`username = $${i++}`); vals.push(username) }
        if (email) { parts.push(`email = $${i++}`); vals.push(email) }
        if (phone) { parts.push(`phone = $${i++}`); vals.push(phone) }
        if (parts.length) {
          vals.push(uid)
          await client.query(`UPDATE users SET ${parts.join(', ')} WHERE id = $${vals.length}`, vals)
        }
      }
      if (requestedRoles) {
        // enforce assignment policy for each requested role
        const requestingRoles = (req.user && req.user.roles) || []
        for (const requestedRole of requestedRoles) {
          if (requestingRoles.includes('superadmin')) {
            // allowed
          } else if (requestingRoles.includes('storeadmin')) {
            if (requestedRole !== 'cashier' && requestedRole !== 'storeadmin') {
              await client.query('ROLLBACK')
              return res.status(403).json({ error: 'Forbidden to assign requested role' })
            }
          } else if (requestingRoles.includes('admin')) {
            if (requestedRole !== 'cashier') {
              await client.query('ROLLBACK')
              return res.status(403).json({ error: 'Forbidden to assign requested role' })
            }
          } else {
            await client.query('ROLLBACK')
            return res.status(403).json({ error: 'Forbidden to assign requested role' })
          }
        }
        // sync roles: delete all and insert requested
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [uid])
        for (const requestedRole of requestedRoles) {
          const r = await client.query('SELECT id FROM roles WHERE name = $1', [requestedRole])
          let roleId
          if (r.rows.length === 0) {
            const r2 = await client.query('INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING id', [requestedRole, requestedRole.charAt(0).toUpperCase() + requestedRole.slice(1)])
            roleId = r2.rows[0].id
          } else {
            roleId = r.rows[0].id
          }
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, roleId])
        }
      }
      await client.query('COMMIT')
      res.json({ ok: true })
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete a user (DELETE /api/users/:id)
router.delete('/:id', requireAuth, async (req, res) => {
  if (!isElevated(req.user && req.user.roles)) return res.status(403).json({ error: 'Forbidden' })
  const uid = Number(req.params.id)
  if (!Number.isInteger(uid) || uid <= 0) return res.status(400).json({ error: 'invalid user id' })
  try {
    const rUser = await db.query('SELECT id, store_id FROM users WHERE id = $1', [uid])
    if (rUser.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    const target = rUser.rows[0]
    const isSuper = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('superadmin')
    const isStoreAdmin = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('storeadmin')
    if (!isSuper && isStoreAdmin) {
      if (!req.user.store_id || req.user.store_id !== target.store_id) return res.status(403).json({ error: 'Forbidden' })
    }
    await db.query('DELETE FROM users WHERE id = $1', [uid])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
