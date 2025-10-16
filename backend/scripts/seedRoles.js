const db = require('../src/db')

async function run() {
  try {
    const roles = [
      { name: 'superadmin', desc: 'Super administrator' },
      { name: 'storeadmin', desc: 'Store administrator' },
      { name: 'user', desc: 'Regular user' }
    ]
    for (const r of roles) {
      await db.query('INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [r.name, r.desc])
      console.log('Ensured role', r.name)
    }
    console.log('Role seeding complete')
    process.exit(0)
  } catch (e) {
    console.error('seed failed', e.message || e)
    process.exit(1)
  }
}

run()
