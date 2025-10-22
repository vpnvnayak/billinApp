const db = require('../backend/src/db')

async function run() {
  try {
    const r = await db.query("SELECT id, sku, name, store_id, store_seq, is_repacking, barcode FROM products WHERE store_seq::text = $1", ['4'])
    console.log('rows:', JSON.stringify(r.rows, null, 2))
  } catch (err) {
    console.error('error', err)
  } finally {
    process.exit(0)
  }
}

run()
