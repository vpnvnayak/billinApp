/**
 * apply-migrations.js
 * Simple Node migration runner for the two SQL files added in the repo:
 *  - migrations/015_add_bank_columns.sql
 *  - migrations/016_drop_hours.sql
 *
 * Usage:
 *   node scripts/apply-migrations.js
 *
 * The script uses the same DB connection as the app (backend/src/db.js). It reads each SQL file
 * and executes it as a single query. It's safe to run multiple times (migrations use IF NOT EXISTS / IF EXISTS).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const MIGRATIONS = [
  'migrations/015_add_bank_columns.sql',
  'migrations/016_drop_hours.sql'
];

// Ensure earlier core migrations (refresh_tokens etc.) are applied too
// Add 002 and 003 which create the refresh_tokens table and add expires_at
MIGRATIONS.unshift('migrations/003_refresh_tokens_add_expires.sql')
MIGRATIONS.unshift('migrations/002_refresh_tokens_and_user_admin.sql')

// new stores table migration
MIGRATIONS.push('migrations/017_create_stores_table.sql')
MIGRATIONS.push('migrations/018_add_store_id_to_users.sql')
MIGRATIONS.push('migrations/019_add_username_phone_to_users.sql')
MIGRATIONS.push('migrations/020_cleanup_stores_table.sql')
// add purchases store_id migration
MIGRATIONS.push('migrations/021_add_store_id_to_purchases.sql')
// add sales store_id migration
MIGRATIONS.push('migrations/022_add_store_id_to_sales.sql')
// add suppliers store_id migration
MIGRATIONS.push('migrations/023_add_store_id_to_suppliers.sql')
// add products store_id migration
MIGRATIONS.push('migrations/024_add_store_id_to_products.sql')
// add customers store_id migration
MIGRATIONS.push('migrations/025_add_store_id_to_customers.sql')
// add store_settings store_id migration
MIGRATIONS.push('migrations/026_add_store_id_to_store_settings.sql')

async function run() {
  console.log('Using DATABASE_URL:', process.env.DATABASE_URL || '(default from db.js)');
  for (const rel of MIGRATIONS) {
    const p = path.join(__dirname, '..', rel);
    if (!fs.existsSync(p)) {
      console.warn('Migration file not found, skipping:', p);
      continue;
    }
    const sql = fs.readFileSync(p, 'utf8');
    console.log('\nApplying', rel);
    try {
      // use a transaction for safety
      await db.query('BEGIN')
      await db.query(sql)
      await db.query('COMMIT')
      console.log('Applied', rel)
    } catch (e) {
      console.error('Failed to apply', rel, e.message || e)
      try { await db.query('ROLLBACK') } catch (er) { /* ignore */ }
    }
  }
  console.log('\nDone.');
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
