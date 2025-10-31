(async ()=>{
  try {
    const db = require('./src/db')
    const r = await db.query('SELECT id, sale_id, product_id, variant_id, sku, name, qty, price, mrp FROM sale_items WHERE sale_id=$1 ORDER BY id', [367])
    console.log(JSON.stringify(r.rows, null, 2))
    process.exit(0)
  } catch (e) {
    console.error('ERR', e)
    process.exit(1)
  }
})()
