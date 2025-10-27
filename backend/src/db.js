const { Pool } = require('pg');
// Load environment variables so scripts that run directly (node scripts/...) pick up .env
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:root@localhost:5432/pos_billing'
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
