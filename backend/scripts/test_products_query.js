const db = require('../src/db');

async function test() {
  try {
    const r = await db.query('SELECT id, sku, name FROM products LIMIT 1');
    console.log('Query succeeded, rows:', r.rows.length);
    if (r.rows.length) console.log(r.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Query error:', err);
    process.exit(1);
  }
}

test();
