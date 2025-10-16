const express = require('express');
const router = express.Router();
const db = require('../db')
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

// GET /api/admin/stats
// Accessible to users with role 'superadmin' (global) or 'storeadmin' (scoped to their store)
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const roles = (req.user && req.user.roles) || []
    const isSuper = roles.includes('superadmin')
    const isStoreAdmin = roles.includes('storeadmin')

    if (!isSuper && !isStoreAdmin) return res.status(403).json({ error: 'Forbidden' })

    // Build optional store filter
    const storeFilter = (isStoreAdmin && req.user && req.user.store_id) ? { enabled: true, id: req.user.store_id } : { enabled: false }

    // total sales and transactions (from sales)
    const salesParams = []
    let salesWhere = ''
    if (storeFilter.enabled) {
      salesParams.push(storeFilter.id)
      salesWhere = 'WHERE s.store_id = $1'
    }
    const salesSql = `SELECT COALESCE(SUM(s.grand_total),0) AS total_sales, COUNT(*) AS transactions FROM sales s ${salesWhere}`
    const salesRes = await db.query(salesSql, salesParams)
    const totalSales = Number(salesRes.rows[0].total_sales || 0)
    const transactions = Number(salesRes.rows[0].transactions || 0)

    // trade-ins: infer from sales.metadata -> assume metadata.trade_ins is array or metadata.trade_in_amount
    // We'll attempt to compute tradeIns count and amount from sale_items where name ILIKE '%trade%' OR from metadata if available
    let tradeIns = 0, tradeInsAmount = 0
    try {
      const tiParams = []
      let tiSql = `SELECT COUNT(*) AS cnt, COALESCE(SUM((s.metadata->>'trade_in_amount')::numeric),0) AS amt FROM sales s`
      if (storeFilter.enabled) {
        tiParams.push(storeFilter.id)
        tiSql += ` WHERE s.store_id = $1`
      }
      const tiRes = await db.query(tiSql, tiParams)
      tradeIns = Number(tiRes.rows[0].cnt || 0)
      tradeInsAmount = Number(tiRes.rows[0].amt || 0)
    } catch (e) {
      // best-effort; leave zeros if parsing/conversion fails
      console.warn('trade-ins calc failed', e && e.message)
    }

    // refunds: best-effort - check for metadata.refund flag or negative grand_total values
    let refundsAmount = 0
    try {
      const rParams = []
      let rSql = `SELECT COALESCE(SUM(CASE WHEN (s.metadata->>'refund')::text = 'true' THEN s.grand_total ELSE 0 END),0) AS refunds_amount FROM sales s`
      if (storeFilter.enabled) {
        rParams.push(storeFilter.id)
        rSql += ` WHERE s.store_id = $1`
      }
      const rRes = await db.query(rSql, rParams)
      refundsAmount = Number(rRes.rows[0].refunds_amount || 0)
    } catch (e) {
      console.warn('refunds calc failed', e && e.message)
    }

    // inventory stats: critical/unavailable/excess and total items
    let critical = 0, unavailable = 0, excess = 0, totalItems = 0
    try {
      const pParams = []
      let pWhere = ''
      if (storeFilter.enabled) {
        pParams.push(storeFilter.id)
        pWhere = 'WHERE store_id = $1'
      }
      // critical: stock <= LOW_STOCK_THRESHOLD; unavailable: stock = 0; excess: stock > (threshold*5)
      const lowThresh = Number(process.env.LOW_STOCK_THRESHOLD || 5)
      let pSql, params
      if (pWhere) {
        // placeholders: $1 = store_id, $2 = lowThresh, $3 = lowThresh*5
        pSql = `SELECT COUNT(*) FILTER (WHERE stock <= $2) AS critical, COUNT(*) FILTER (WHERE stock = 0) AS unavailable, COUNT(*) FILTER (WHERE stock > $3) AS excess, COUNT(*) AS total FROM products ${pWhere}`
        params = pParams.concat([lowThresh, lowThresh * 5])
      } else {
        // no store filter: use $1 and $2 for thresholds
        pSql = `SELECT COUNT(*) FILTER (WHERE stock <= $1) AS critical, COUNT(*) FILTER (WHERE stock = 0) AS unavailable, COUNT(*) FILTER (WHERE stock > $2) AS excess, COUNT(*) AS total FROM products`
        params = [lowThresh, lowThresh * 5]
      }
      const pRes = await db.query(pSql, params)
      critical = Number(pRes.rows[0].critical || 0)
      unavailable = Number(pRes.rows[0].unavailable || 0)
      excess = Number(pRes.rows[0].excess || 0)
      totalItems = Number(pRes.rows[0].total || 0)
    } catch (e) {
      console.warn('inventory calc failed', e && e.message)
    }

    // total credit (payables) from suppliers. Use suppliers.credit_due if present, otherwise sum from purchases metadata
    let totalCredit = 0
    try {
      let cSql = 'SELECT COALESCE(SUM(credit_due),0) AS total_credit FROM suppliers'
      const cParams = []
      if (storeFilter.enabled) {
        cParams.push(storeFilter.id)
        cSql += ' WHERE store_id = $1'
      }
      const cRes = await db.query(cSql, cParams)
      totalCredit = Number(cRes.rows[0].total_credit || 0)
    } catch (e) {
      console.warn('credit calc failed', e && e.message)
    }

    res.json({
      totalSales,
      transactions,
      tradeIns,
      tradeInsAmount,
      refundsAmount,
      critical,
      unavailable,
      excess,
      totalItems,
      totalCredit
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router;

// GET /api/admin/stores - list stores accessible to the user (superadmin => all, storeadmin => their store)
router.get('/stores', requireAuth, async (req, res) => {
  try {
    const roles = (req.user && req.user.roles) || []
    const isSuper = roles.includes('superadmin')
    const isStoreAdmin = roles.includes('storeadmin')
    if (!isSuper && !isStoreAdmin) return res.status(403).json({ error: 'Forbidden' })

    // build select list based on available columns (schemaCache helps avoid missing column errors)
    const schemaCache = require('../schemaCache')
    const cols = ['id', 'name']
    if (schemaCache.hasColumn('stores', 'username')) cols.push('username')
    if (schemaCache.hasColumn('stores', 'email')) cols.push('email')
    if (schemaCache.hasColumn('stores', 'phone')) cols.push('phone')
    if (schemaCache.hasColumn('stores', 'logo_url')) cols.push('logo_url')
    const sel = cols.join(', ')
    if (isSuper) {
      const r = await db.query(`SELECT ${sel} FROM stores ORDER BY id`)
      return res.json(r.rows)
    }
    // storeadmin: show only the store they belong to (if present)
    const sid = req.user && req.user.store_id
    if (!sid) return res.json([])
  const r = await db.query(`SELECT ${sel} FROM stores WHERE id = $1`, [sid])
  return res.json(r.rows || [])
  } catch (e) {
    console.error('admin/stores failed', e && e.message)
    res.status(500).json({ error: 'internal error' })
  }
})

// POST /api/admin/stores/switch - set selected store for the session (frontend can read cookie)
router.post('/stores/switch', requireAuth, async (req, res) => {
  try {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'store id required' })
    // verify user has access to this store
    const roles = (req.user && req.user.roles) || []
    const isSuper = roles.includes('superadmin')
    const isStoreAdmin = roles.includes('storeadmin')
    if (!isSuper && !isStoreAdmin) return res.status(403).json({ error: 'Forbidden' })
    if (isStoreAdmin && req.user.store_id && Number(req.user.store_id) !== Number(id)) return res.status(403).json({ error: 'Forbidden' })

    // set a non-HttpOnly cookie so frontend can read selected store; cookie expires in 30d
    res.cookie('selectedStore', String(id), { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax' })
    res.json({ ok: true })
  } catch (e) {
    console.error('stores/switch failed', e && e.message)
    res.status(500).json({ error: 'internal error' })
  }
})
