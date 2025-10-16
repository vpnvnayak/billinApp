// Simple migration runner: executes all .sql files in migrations/ in alphabetical order
// MIGRATE_SAFE
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    // ensure migrations table exists (in case this is first run)
    await pool.query(`CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT now())`);
    const applied = await pool.query('SELECT name FROM migrations');
    const appliedSet = new Set(applied.rows.map(r => r.name));
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log('Skipping already applied', file);
        continue
      }
      const filePath = path.join(MIGRATIONS_DIR, file)
      const sql = fs.readFileSync(filePath, 'utf8');
      const noTx = file.endsWith('.nt.sql') || (/--\s*NO-TRANSACTION/i).test(sql)
      console.log('Running', file, noTx ? '(no-transaction mode)' : '')
      if (noTx) {
        // Execute without wrapping in a transaction (useful for CREATE INDEX CONCURRENTLY)
        try {
          await pool.query(sql);
          await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        } catch (err) {
          throw err;
        }
      } else {
        await pool.query('BEGIN');
        try {
          await pool.query(sql);
          await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          await pool.query('COMMIT');
        } catch (err) {
          await pool.query('ROLLBACK');
          throw err;
        }
      }
    }
    console.log('Migrations complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed', err);
    process.exit(1);
  }
}

run();
