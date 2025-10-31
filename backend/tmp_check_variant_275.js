(async ()=>{
  try {
    const db = require('./src/db')
    const r = await db.query('SELECT id, product_id, mrp, price FROM product_variants WHERE id=$1', [275])
    console.log(JSON.stringify(r.rows, null, 2))
    process.exit(0)
  } catch (e) {
    console.error('ERR', e)
    process.exit(1)
  }
})()
