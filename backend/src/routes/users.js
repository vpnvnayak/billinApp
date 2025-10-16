const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// List users (admin only)
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Return users with an aggregated array of role names
    // Superadmin sees all users; other admins see only users for their store
    const isSuper = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('superadmin')
    if (isSuper) {
      const r = await db.query(`
        SELECT u.id, u.email, u.full_name, u.created_at,
               COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        GROUP BY u.id
        ORDER BY u.id DESC
      `)
      return res.json(r.rows)
    }

    // non-super admins: scope to store
    const storeId = req.user && req.user.store_id ? req.user.store_id : null
    if (!storeId) return res.status(403).json({ error: 'Forbidden' })
    const r = await db.query(`
      SELECT u.id, u.email, u.full_name, u.created_at,
             COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.store_id = $1
      GROUP BY u.id
      ORDER BY u.id DESC
    `, [storeId])
    res.json(r.rows)
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign role to user (admin only)
router.post('/:id/roles', requireAuth, requireRole('admin'), async (req, res) => {
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

// Remove role from user (admin only)
router.delete('/:id/roles/:role', requireAuth, requireRole('admin'), async (req, res) => {
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
