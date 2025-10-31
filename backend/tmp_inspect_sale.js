const db = require('./src/db');
(async () => {
  try {
    const saleId = 362;
  const q = `SELECT si.id, si.product_id, si.sku, si.name, si.qty, si.price, si.tax_percent, si.line_total, COALESCE(p.mrp, p.price) AS mrp FROM sale_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id=$1`;
    const r = await db.query(q, [saleId]);
    console.log(JSON.stringify(r.rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();