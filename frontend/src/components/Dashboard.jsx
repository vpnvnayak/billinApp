import React, { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

export default function Dashboard() {
  const [adminStats, setAdminStats] = useState(null)
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [totalCredit, setTotalCredit] = useState(0)
  const [recentPurchases, setRecentPurchases] = useState([])
  const [lowStockCount, setLowStockCount] = useState(0)
  const [lowStockList, setLowStockList] = useState([])
  const [topProducts, setTopProducts] = useState([])

  const [loading, setLoading] = useState(false)

  const norm = (r) => (r && r.data && (Array.isArray(r.data) ? r.data : (r.data.data || []))) || []

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const a = await api.get('/admin/stats').catch(() => null)
      if (a && a.data) setAdminStats(a.data)

      const salesR = await api.get('/sales').catch(() => null)
      if (salesR) {
        try { console.debug('sales raw response', salesR.data) } catch (e) {}
        const rows = norm(salesR)
        const normRows = rows.map(s => ({ ...s, created_at: s.created_at ? new Date(s.created_at).toISOString() : null }))
        setSales(normRows)
      }

      const prodR = await api.get('/products').catch(() => null)
      if (prodR) setProducts(norm(prodR))

      const supR = await api.get('/suppliers/aggregates').catch(() => null)
      if (supR && supR.data) {
        const rows = supR.data || []
        const total = rows.reduce((s, it) => s + (Number(it.credit_due) || 0), 0)
        setTotalCredit(total)
      }

      const purR = await api.get('/purchases?limit=10').catch(() => null)
      if (purR) setRecentPurchases(purR.data || [])

      const lowCountR = await api.get('/products?filter=low_stock&limit=1').catch(() => null)
      if (lowCountR) {
        const total = (lowCountR.data && (lowCountR.data.total || 0)) || 0
        setLowStockCount(Number(total) || 0)
      }

      const lowListR = await api.get('/products?filter=low_stock&limit=6').catch(() => null)
      if (lowListR) {
        const rows = (lowListR.data && (lowListR.data.data || lowListR.data)) || []
        setLowStockList(rows)
      }

      const topR = await api.get('/products/top?limit=5').catch(() => null)
      if (topR) {
        const rows = (topR.data && (topR.data.data || topR.data)) || []
        setTopProducts(rows)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchAll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [fetchAll])

  const totalSales = adminStats?.totalSales || sales.reduce((s, x) => s + (Number(x.grand_total) || 0), 0)
  const transactions = adminStats?.transactions || sales.length
  const tradeIns = adminStats?.tradeIns || 0

  const avgTx = totalSales && transactions ? (totalSales / Math.max(1, transactions)).toFixed(2) : '0.00'
  const salesAmount = totalSales.toFixed ? totalSales.toFixed(2) : String(totalSales)
  const tradeInsAmount = adminStats?.tradeInsAmount || 0
  const refundsAmount = adminStats?.refundsAmount || 0

  const totalItems = products.length
  const topCategory = (products[0] && products[0].category) || 'General'

  const recentAccepted = products.slice(0, 6)

  return (
    <div className="dashboard-grid">
      <div className="dashboard-top">
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
          <button
            className="icon-btn"
            onClick={() => fetchAll()}
            disabled={loading}
            title="Refresh dashboard data"
            aria-label="Refresh dashboard"
          >
            <ArrowPathIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div className="tile-row">
          <div className="tile big">
            <div className="tile-label">Transaction Count</div>
            <div className="tile-value">{transactions}</div>
            <div className="tile-sub"><span className="delta">+2.9%</span> <span className="muted">from last week</span></div>
          </div>
          <div className="tile big">
            <div className="tile-label">Total sales</div>
            <div className="tile-value">{salesAmount}</div>
            <div className="tile-sub"><span className="delta">+5.6%</span> <span className="muted">from last week</span></div>
          </div>
          <div className="tile big">
            <div className="tile-label">Total Trade-Ins</div>
            <div className="tile-value">{tradeIns}</div>
            <div className="tile-sub"><span className="delta">+3.5%</span> <span className="muted">from last week</span></div>
          </div>
          <div className="tile big">
            <div className="tile-label">Total Credit (payables)</div>
            <div className="tile-value">{`₹ ${Number(totalCredit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
            <div className="tile-sub"><span className="delta">—</span> <span className="muted">current outstanding</span></div>
          </div>
        </div>

        <div className="tile-row smalls">
          <div className="tile small">
            <div className="tile-label">Average Transaction Value</div>
            <div className="tile-value small-val">₹ {avgTx}</div>
            <div className="tile-sub"><span className="delta">+6.2%</span> <span className="muted">from last week</span></div>
          </div>
          <div className="tile small">
            <div className="tile-label">Sales amount</div>
            <div className="tile-value small-val">₹ {salesAmount}</div>
            <div className="tile-sub"><span className="delta">+10.02%</span> <span className="muted">from last week</span></div>
          </div>
          <div className="tile small">
            <div className="tile-label">Trade-Ins amount</div>
            <div className="tile-value small-val">₹ {tradeInsAmount}</div>
            <div className="tile-sub"><span className="delta">-1.6%</span> <span className="muted">from last week</span></div>
          </div>
          <div className="tile small">
            <div className="tile-label">Refunds amount</div>
            <div className="tile-value small-val">₹ {refundsAmount}</div>
            <div className="tile-sub"><span className="delta">-4.7%</span> <span className="muted">from last week</span></div>
          </div>
        </div>

        <div className="tile-row smalls bottom">
          <div className="tile small wide">
            <div className="tile-label">Total items in stock</div>
            <div className="tile-value small-val">{totalItems}</div>
            <div className="tile-sub"><span className="muted">Critical: {adminStats?.critical || 0} • Unavailable: {adminStats?.unavailable || 0} • Excess: {adminStats?.excess || 0}</span></div>
          </div>
          <div className="tile small wide">
            <div className="tile-label">Top Category</div>
            <div className="tile-value small-val">{topCategory}</div>
          </div>
          <div className="tile small">
            <div className="tile-label">Low stock</div>
            <div className="tile-value small-val">{lowStockCount}</div>
            <div className="tile-sub"><a href="#" onClick={(e) => { e.preventDefault(); window.__appNavigate('/products?filter=low_stock') }}>View products</a></div>
          </div>
        </div>
      </div>

      <div className="dashboard-main">
        <div className="chart-area">
          <div className="card-head">Sales Trends</div>
          <div className="chart-placeholder">
            <SalesChart sales={sales} />
          </div>
        </div>

        <div className="right-column">
          <div className="accepted-card">
            <div className="card-head">Accepted Items <span className="muted">{recentAccepted.length} total items</span></div>
            <div className="accepted-list">
              {recentAccepted.map((p, i) => (
                <div key={p.id || i} className="accepted-row">
                  <div className="accepted-media">{p.image ? <img src={p.image} alt={p.name} /> : <div className="avatar-small">{(p.name||'I').charAt(0)}</div>}</div>
                  <div className="accepted-info">
                    <div className="accepted-name">{p.name || p.title || 'Product'}</div>
                    <div className="accepted-meta">SKU {p.sku || p.id}</div>
                  </div>
                  <div className="accepted-amount">{p.stock ? `${p.stock} pcs` : '—'}</div>
                  <div className={`accepted-status ${p.stock ? 'in' : 'out'}`}>{p.stock ? 'In Stock' : 'Out of stock'}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="accepted-card">
            <div className="card-head">Recent Purchases <span className="muted">{recentPurchases.length || 0}</span></div>
            <div className="accepted-list">
              {recentPurchases.map((p, i) => {
                const paid = p.metadata && Number(p.metadata.paid || 0)
                const total = Number(p.total_amount || 0)
                let status = 'Unpaid'
                if (paid >= total && total > 0) status = 'Paid'
                else if (paid > 0 && paid < total) status = 'Partial'
                const timeAgo = (ts) => {
                  if (!ts) return '-'
                  const d = new Date(ts)
                  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
                  if (diff < 60) return `${diff}s ago`
                  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
                  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
                  return `${Math.floor(diff/86400)}d ago`
                }
                return (
                  <div key={p.id || i} className="accepted-row" style={{ cursor: 'pointer' }} onClick={() => window.__appNavigate(`/purchases/${p.id}`)}>
                    <div className="accepted-info">
                      <div className="accepted-name">{p.supplier_name || 'Supplier'}</div>
                      <div className="accepted-meta">{timeAgo(p.created_at)}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div className="accepted-amount">{`₹ ${Number(total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}</div>
                      <div className={`accepted-status ${status === 'Paid' ? 'in' : status === 'Partial' ? 'warn' : 'out'}`}>{status}</div>
                    </div>
                  </div>
                )
              })}
              {recentPurchases.length === 0 && <div className="muted" style={{ padding: 12 }}>No recent purchases</div>}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-surface-3)', textAlign: 'right' }}>
              <a href="#" onClick={(e) => { e.preventDefault(); window.__appNavigate('/purchases') }}>View all purchases</a>
            </div>
          </div>
          <div className="accepted-card">
            <div className="card-head">Low stock products <span className="muted">{lowStockList.length}</span></div>
            <div className="accepted-list">
              {lowStockList.length === 0 && <div className="muted" style={{ padding: 12 }}>No low-stock products</div>}
              {lowStockList.map((p, i) => (
                <div key={p.id || i} className="accepted-row">
                  <div className="accepted-info">
                    <div className="accepted-name">{p.name || 'Product'}</div>
                    <div className="accepted-meta">SKU {p.sku || p.id}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div className="accepted-amount">{p.stock != null ? `${p.stock} pcs` : '—'}</div>
                    <div className={`accepted-status ${p.stock ? 'warn' : 'out'}`}>{p.stock ? 'Low' : 'Out'}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-surface-3)', textAlign: 'right' }}>
              <a href="#" onClick={(e) => { e.preventDefault(); window.__appNavigate('/products?filter=low_stock') }}>View all</a>
            </div>
          </div>
          <div className="accepted-card">
            <div className="card-head">Top products by revenue <span className="muted">Top 5</span></div>
            <div className="accepted-list">
              {topProducts.length === 0 && <div className="muted" style={{ padding: 12 }}>No data</div>}
              {topProducts.map((p, i) => (
                <div key={p.product_id || i} className="accepted-row">
                  <div className="accepted-info">
                    <div className="accepted-name">{p.name || p.sku || 'Product'}</div>
                    <div className="accepted-meta">SKU {p.sku || (p.product_id || '')}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div className="accepted-amount">₹ {Number(p.revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    <div className="accepted-meta">{p.total_qty || 0} sold</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-surface-3)', textAlign: 'right' }}>
              <a href="#" onClick={(e) => { e.preventDefault(); window.__appNavigate('/products') }}>View products</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SalesChart({ sales }) {
  // group sales by day (last 7 days)
  const now = new Date()
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    days.push(d)
  }
  const labels = days.map(d => d.toLocaleDateString())

  // build a map of dateKey -> { amount, count } for faster lookup and to ensure consistent buckets
  const sumsByKey = sales.reduce((acc, x) => {
    const t = x.created_at || x.createdAt || x.date
    if (!t) return acc
    const dt = new Date(t)
    if (!isFinite(dt.getTime())) return acc
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
    const amt = Number(x.grand_total) || 0
    if (!acc[key]) acc[key] = { amount: 0, count: 0 }
    acc[key].amount += amt
    acc[key].count += 1
    return acc
  }, {})

  const totals = days.map(d => {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return Number((sumsByKey[key] && sumsByKey[key].amount) || 0)
  })

  const max = Math.max(...totals, 1)
  const allZero = totals.every(v => v === 0)
  if (allZero) return <div style={{ padding: 20 }} className="muted">No sales in the last 7 days</div>
  const w = 640, h = 220, pad = 24
  const [hoverIndex, setHoverIndex] = useState(null)

  const points = totals.map((v, i) => {
    const x = pad + (i / (totals.length - 1)) * (w - pad * 2)
    const y = pad + (1 - v / max) * (h - pad * 2)
    return [x, y]
  })
  const path = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ')
  const areaPath = `${path} L ${pad + (w - pad * 2)} ${h - pad} L ${pad} ${h - pad} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="220" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary, #7c3aed)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-primary, #7c3aed)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="transparent" />
      <g>
        <path d={areaPath} fill="url(#g1)" stroke="none" />
        <path d={path} fill="none" stroke="var(--color-primary-700, #6d28d9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i}
            cx={p[0]} cy={p[1]} r={4}
            fill="var(--color-primary-700, #6d28d9)"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseMove={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          />
        ))}
        {hoverIndex != null && (() => {
          const px = points[hoverIndex][0]
          const py = points[hoverIndex][1]
          const day = days[hoverIndex]
          const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
          const info = sumsByKey[key] || { amount: 0, count: 0 }
          const lines = [
            `${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
            `Sales: ${info.count}`,
            `Total: ₹ ${Number(info.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          ]
          const boxW = 150
          const boxH = 16 * lines.length + 8
          const bx = Math.max(pad, Math.min(px + 8, w - boxW - pad))
          const by = Math.max(pad, py - boxH - 8)
          return (
            <g key={`tip-${hoverIndex}`}>
              <rect x={bx} y={by} width={boxW} height={boxH} rx={6} ry={6} fill="#fff" stroke="var(--color-surface-3)" />
              <g fill="#111" fontSize="12">
                {lines.map((t, idx) => (
                  <text key={idx} x={bx + 8} y={by + 16 + idx * 16} fill="#000">{t}</text>
                ))}
              </g>
            </g>
          )
        })()}
      </g>
      <g fill="var(--color-muted)" fontSize="11">
        {labels.map((l, i) => {
          const x = pad + (i / (labels.length - 1)) * (w - pad * 2)
          return <text key={i} x={x} y={h - 6} textAnchor="middle">{new Date(days[i]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>
        })}
      </g>
    </svg>
  )
}
