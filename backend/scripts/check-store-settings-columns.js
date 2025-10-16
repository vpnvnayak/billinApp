#!/usr/bin/env node
// Quick diagnostic to show which columns exist in store_settings using the app DB connection
require('dotenv').config();
const db = require('../src/db');

;(async function(){
  try {
    console.log('Using DATABASE_URL:', process.env.DATABASE_URL || '(default from db.js)');

    const r = await db.query("SELECT table_schema, column_name, data_type FROM information_schema.columns WHERE table_name = 'store_settings' ORDER BY ordinal_position")
    if (!r || !r.rows || r.rows.length === 0) {
      console.log('\nNo rows returned from information_schema for table_name = store_settings. Table may not exist in this database.');
    } else {
      console.log('\nstore_settings columns:');
      for (const row of r.rows) {
        console.log(` - ${row.column_name} (${row.data_type}) [schema=${row.table_schema}]`)
      }
    }

    // Try a sample select to see if the table is accessible
    try {
      const s = await db.query('SELECT * FROM store_settings WHERE id = $1 LIMIT 1', [1])
      console.log('\nSELECT * FROM store_settings WHERE id=1 returned rows:', s.rows.length)
    } catch (err) {
      console.error('\nSelecting from store_settings failed:', err.message)
    }
  } catch (e) {
    console.error('Error while checking store_settings columns:', e)
  } finally {
    process.exit(0)
  }
})();
