const db = require('../src/db')

async function cleanupBySku(sku) {
  if (!sku) return
  try {
    // remove purchase items referencing this sku
    await db.query('DELETE FROM purchase_items WHERE sku = $1', [sku])
  } catch (e) {
    // ignore
  }

  try {
    // remove purchases that no longer have items
    await db.query('DELETE FROM purchases WHERE id NOT IN (SELECT DISTINCT purchase_id FROM purchase_items)')
  } catch (e) {}

  try {
    const pres = await db.query('SELECT id FROM products WHERE sku = $1', [sku])
    const ids = pres.rows.map(r => r.id)
    if (ids.length > 0) {
      await db.query('DELETE FROM product_variants WHERE product_id = ANY($1::int[])', [ids])
      await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [ids])
    }
  } catch (e) {}
}

async function cleanupByProductId(productId) {
  if (!productId) return
  try { await db.query('DELETE FROM purchase_items WHERE product_id = $1', [productId]) } catch (e) {}
  try { await db.query('DELETE FROM purchases WHERE id NOT IN (SELECT DISTINCT purchase_id FROM purchase_items)') } catch (e) {}
  try { await db.query('DELETE FROM product_variants WHERE product_id = $1', [productId]) } catch (e) {}
  try { await db.query('DELETE FROM products WHERE id = $1', [productId]) } catch (e) {}
}

async function cleanupBySkus(skus) {
  if (!skus) return
  if (!Array.isArray(skus)) return cleanupBySku(skus)
  for (const s of skus) {
    // sequential to avoid DB overload in CI
    // eslint-disable-next-line no-await-in-loop
    await cleanupBySku(s)
  }
}

async function cleanupBySkuPattern(pattern) {
  if (!pattern) return
  try {
    const res = await db.query(`SELECT sku FROM products WHERE sku ILIKE $1`, [pattern])
    const skus = res.rows.map(r => r.sku).filter(Boolean)
    await cleanupBySkus(skus)
  } catch (e) {
    // ignore
  }
}

module.exports = { cleanupBySku, cleanupByProductId, cleanupBySkus, cleanupBySkuPattern }
