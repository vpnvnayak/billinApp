const db = require('../src/db');
const bcrypt = require('bcrypt');

(async () => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const s = await client.query("INSERT INTO stores (name, created_at, updated_at) VALUES ($1, now(), now()) RETURNING id", ['TestScript']);
    console.log('storeId', s.rows[0].id);
    const pw = await bcrypt.hash('Secret123!', 10);
    const u = await client.query(
      "INSERT INTO users (email,password_hash,full_name,username,phone,store_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING id",
      ['scriptuser@example.com', pw, null, 'scriptuser', '9999', s.rows[0].id]
    );
    console.log('userId', u.rows[0].id);
    const role = await client.query('SELECT id FROM roles WHERE name=$1', ['storeadmin']);
    console.log('role', role.rows);
    if (role.rows.length === 0) {
      const r2 = await client.query('INSERT INTO roles (name,description) VALUES ($1,$2) RETURNING id', ['storeadmin', 'Store admin']);
      console.log('created role', r2.rows[0]);
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [u.rows[0].id, r2.rows[0].id]);
    } else {
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [u.rows[0].id, role.rows[0].id]);
    }
    await client.query('COMMIT');
    console.log('done commit');
  } catch (e) {
    console.error('err', e.message || e);
    try { await client.query('ROLLBACK') } catch (er) { console.error('rollback failed', er.message || er) }
  } finally {
    client.release();
    process.exit(0);
  }
})();
