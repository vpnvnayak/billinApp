const fs = require('fs')
const path = require('path')
const db = require('../src/db')

async function run() {
  try {
    const sqlPath = path.join(__dirname, '..', '..', 'migrations', '038_create_posters.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    console.log('Running migration: 038_create_posters.sql')
    await db.query(sql)
    console.log('Migration applied successfully')
  } catch (err) {
    console.error('Migration failed:', err)
    process.exitCode = 1
  } finally {
    try { await db.pool.end() } catch (e) {}
  }
}

run()
