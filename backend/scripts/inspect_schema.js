const db = require('../src/db')

async function info() {
  try {
    console.log('Using connection string:', process.env.DATABASE_URL || 'default fallback')

    const tables = ['products','sale_items','sales','migrations']
    for (const t of tables) {
      try {
        const cols = await db.query(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [t])
        console.log('\nTable:', t, 'columns:', cols.rows.length)
        for (const c of cols.rows) console.log('  ', c.column_name, c.data_type, c.column_default || '')
      } catch (e) {
        console.error('  failed to read table', t, e.message)
      }
    }

    // show recent migrations
    try {
      const r = await db.query('SELECT id, name, applied_at FROM migrations ORDER BY applied_at DESC LIMIT 20')
      console.log('\nMigrations (recent):', r.rows.length)
      for (const m of r.rows) console.log('  ', m.id, m.name, m.applied_at)
    } catch (e) {
      console.error('\n  failed to read migrations table:', e.message)
    }

    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

info()
