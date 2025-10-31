const db = require('./src/db');
(async () => {
  try {
    const r = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='sale_items' ORDER BY ordinal_position");
    console.log(r.rows.map(x => x.column_name).join(', '));
  } catch (e) {
    console.error('ERROR', e.message);
  } finally {
    process.exit();
  }
})();