const db = require('./src/db');
const saleId = Number(process.argv[2] || 0);
(async () => {
  try {
    const r = await db.query('SELECT id, sale_id, product_id, variant_id, mrp FROM sale_items WHERE sale_id = $1', [saleId]);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error('ERROR', e.message);
  } finally {
    process.exit();
  }
})();