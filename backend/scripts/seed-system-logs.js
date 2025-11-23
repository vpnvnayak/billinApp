// Seed sample rows into system_logs for UI testing
const db = require('../src/db')

async function run() {
  try {
    const rows = [
      {
        level: 'info',
        message: 'Processed POS sale',
        meta: {
          userName: 'Antony Graham',
          userAvatar: null,
          userRole: 'Manager',
          action: 'POS Sale',
          module: 'Sales',
          ip: '192.168.0.1'
        }
      },
      {
        level: 'info',
        message: 'Added new stock',
        meta: {
          userName: 'Samantha Fox',
          userAvatar: null,
          userRole: 'Inventory',
          action: 'Inventory Update',
          module: 'Inventory',
          ip: '192.168.0.1'
        }
      },
      {
        level: 'warn',
        message: 'Adjusted stock levels',
        meta: {
          userName: 'Samantha Fox',
          userAvatar: null,
          userRole: 'Inventory',
          action: 'Inventory Update',
          module: 'Inventory',
          ip: '192.168.0.1'
        }
      },
      {
        level: 'info',
        message: 'Created new customer',
        meta: {
          userName: 'James Harrison',
          userAvatar: null,
          userRole: 'Cashier',
          action: 'Customers',
          module: 'Customers',
          ip: '192.168.0.1'
        }
      },
      {
        level: 'error',
        message: 'User login failed',
        meta: {
          userName: 'Unknown',
          userAvatar: null,
          userRole: '',
          action: 'Auth',
          module: 'Auth',
          ip: '192.168.0.1'
        }
      }
    ]

    for (const r of rows) {
      await db.query('INSERT INTO system_logs (level, message, meta, store_id) VALUES ($1,$2,$3,$4)', [r.level, r.message, r.meta, null])
    }

    const res = await db.query('SELECT id, level, message, meta, store_id, created_at FROM system_logs ORDER BY created_at DESC LIMIT 10')
    console.log('Inserted sample logs, latest rows:')
    console.table(res.rows.map(rr => ({ id: rr.id, level: rr.level, message: rr.message, meta: rr.meta, created_at: rr.created_at })))
    process.exit(0)
  } catch (e) {
    console.error('Seeding failed', e)
    process.exit(1)
  }
}

run()
