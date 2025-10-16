// Run with: node scripts/seedAuth.js
const db = require('../src/db');
const bcrypt = require('bcrypt');

async function run() {
  try {
    // create roles
    await db.query("INSERT INTO roles (name, description) VALUES ('admin', 'Administrator') ON CONFLICT (name) DO NOTHING");
    await db.query("INSERT INTO roles (name, description) VALUES ('cashier', 'Cashier role') ON CONFLICT (name) DO NOTHING");

    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const adminPass = process.env.SEED_ADMIN_PASSWORD || 'admin123';

    // create user if not exists
    const r = await db.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    let userId;
    if (r.rows.length === 0) {
      const hash = await bcrypt.hash(adminPass, 10);
      const ins = await db.query('INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id', [adminEmail, hash, 'Admin User']);
      userId = ins.rows[0].id;
      console.log('Created admin user', adminEmail);
    } else {
      userId = r.rows[0].id;
      console.log('Admin user already exists');
    }

    // attach admin role
    const role = await db.query('SELECT id FROM roles WHERE name = $1', ['admin']);
    if (role.rows.length > 0) {
      const roleId = role.rows[0].id;
      await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, roleId]);
      console.log('Ensured admin role assigned');
    }

    console.log('Seeding complete');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
