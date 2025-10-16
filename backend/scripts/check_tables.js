// Quick script that uses the same db.js Pool to check for products and customers tables
const db = require('../src/db');

async function check() {
  try {
    const res = await db.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name IN ('products','customers')");
    console.log('Connection string used (from env):', process.env.DATABASE_URL || 'not set, default in src/db.js');
    console.log('Found tables:');
    console.table(res.rows);
    process.exit(0);
  } catch (err) {
    console.error('Error checking tables', err);
    process.exit(1);
  }
}

check();
