const { Pool } = require('pg');
require('dotenv').config();

// Use DATABASE_URL if provided (Render/Production), otherwise fallback to local.
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:root@localhost:5432/pos_billing';

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false } // Render requires SSL
    : false,
});

pool.on('connect', () => {
  //console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL error:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
