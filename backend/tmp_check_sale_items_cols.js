(async ()=>{
  try {
    const db = require('./src/db')
    const r = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sale_items' ORDER BY ordinal_position")
    console.log(JSON.stringify(r.rows, null, 2))
    process.exit(0)
  } catch (e) {
    console.error('ERR', e)
    process.exit(1)
  }
})()
