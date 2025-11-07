import React, { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function StockReport() {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({ low_stock: 0, out_of_stock: 0, expired_batches: 0 })
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)

  // UI state
  const [perPage, setPerPage] = useState(5)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query, 200)

  // Load data from server using server-side paging and search
  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', String(perPage))
        if (debouncedQuery) params.set('q', debouncedQuery)

      // Use shared axios instance so Authorization header and refresh flow are applied
      const resp = await api.get('/reports/stock', { params: { page: page, limit: perPage, q: debouncedQuery || undefined } })
      const json = resp && resp.data ? resp.data : null
        if (!mounted) return
        setKpis(json.kpis || { low_stock: 0, out_of_stock: 0, expired_batches: 0 })
        setItems(Array.isArray(json.data) ? json.data : [])
        setTotal(typeof json.total === 'number' ? json.total : 0)
      } catch (err) {
        // fallback to sample data
        if (mounted) {
          setKpis({ low_stock: 0, out_of_stock: 0, expired_batches: 0 })
          setItems([])
          setTotal(0)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [page, perPage, debouncedQuery])

  // Server-side paging: items contains the current page data, total contains full count
  const pages = Math.max(1, Math.ceil(total / perPage))
  const pageItems = items || []

  // when perPage or query changes, reset to first page (will trigger useEffect load)
  useEffect(() => { setPage(1) }, [perPage, debouncedQuery])

  function onPrint() {
    // open a print-friendly window containing KPI cards and the current table page
    const html = buildPrintHtml(kpis, pageItems)
    const w = window.open('', '_blank', 'toolbar=0,location=0,menubar=0')
    if (!w) {
      // fallback to default print
      window.print()
      return
    }
    w.document.write(html)
    w.document.close()
    // wait a tick for styles and content to render, then print
    setTimeout(() => {
      try { w.focus(); w.print(); } catch (e) { console.warn('print failed', e) }
      // do not auto-close: some browsers block it; user can close the tab
    }, 250)
  }
  // Build a simple printable HTML string for KPIs and the current table page
  function buildPrintHtml(kpisObj, rows) {
    const headerStyle = `font-family: Arial, Helvetica, sans-serif;`;
    const tableHeadHtml = `
      <tr>
        <th>Sl.No.</th>
        <th>Item Name</th>
        <th>Item Code</th>
        <th>HSN</th>
        <th>MRP</th>
        <th>Purchased Price</th>
        <th>Selling Price</th>
        <th>TAX</th>
        <th>Purchased Quantity</th>
        <th>Stock</th>
        <th>Unit</th>
        <th>Stock Value</th>
      </tr>`
    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td>${(page - 1) * perPage + i + 1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.code || '')}</td>
        <td>${escapeHtml(r.hsn || '-')}</td>
        <td>${escapeHtml(r.mrp)}</td>
        <td>${escapeHtml(r.purchased_price)}</td>
        <td>${escapeHtml(r.selling_price)}</td>
        <td>${escapeHtml(r.tax)}</td>
        <td>${escapeHtml(r.purchased_qty)}</td>
        <td>${escapeHtml(r.stock)}</td>
        <td>${escapeHtml(r.unit)}</td>
        <td>${escapeHtml(r.stock_value)}</td>
      </tr>`).join('\n')

    const kpiHtml = `
      <div style="display:flex;gap:12px;margin-bottom:12px;">
        <div style="background:#ef9a1a;color:#fff;padding:10px;min-width:120px;">LOW STOCK<br/><strong style=\"font-size:18px\">${kpisObj.low_stock}</strong></div>
        <div style="background:#ef4444;color:#fff;padding:10px;min-width:120px;">OUT OF STOCK<br/><strong style=\"font-size:18px\">${kpisObj.out_of_stock}</strong></div>
        <div style="background:#8b2626;color:#fff;padding:10px;min-width:120px;">EXPIRED BATCHES<br/><strong style=\"font-size:18px\">${kpisObj.expired_batches}</strong></div>
      </div>`

    return `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Stock Report</title>
        <style>
          body { ${headerStyle} font-size:12px; margin:18px }
          table { border-collapse:collapse; width:100%; }
          th, td { border:1px solid #ddd; padding:6px; }
          th { background:#f7f7f7; text-align:left }
          @media print { th { background:#eee } }
        </style>
      </head>
      <body>
        <h2>Stock Report</h2>
        <div><em>* STOCK VALUE IS CALCULATED ON UNIT PURCHASE AMOUNT (INCLUDING TAX).</em></div>
        ${kpiHtml}
        <table>
          <thead>${tableHeadHtml}</thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
      </html>`
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return ''
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // Download .xlsx using dynamic SheetJS import if available. Fallback to an HTML-based .xls that Excel can open.
  async function downloadXLSX() {
    const header = ['SlNo', 'Item Name', 'Item Code', 'HSN', 'MRP', 'Purchased Price', 'Selling Price', 'TAX', 'Purchased Qty', 'Stock', 'Unit', 'Stock Value']
    const rows = pageItems.map((r, i) => [((page - 1) * perPage) + i + 1, r.name, r.code, r.hsn || '-', r.mrp, r.purchased_price, r.selling_price, r.tax, r.purchased_qty, r.stock, r.unit, r.stock_value])
    // try dynamic import of xlsx (SheetJS)
    try {
      const mod = await import('xlsx')
      const XLSX = mod && (mod.default || mod)
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Stock')
      // writeFile triggers a download in browser environment
      XLSX.writeFile(wb, 'stock-report.xlsx')
      return
    } catch (e) {
      console.warn('SheetJS not available or failed to load, falling back to HTML/.xls export', e)
    }

    // Fallback: build HTML table and download as .xls (Excel-friendly)
    const tableHtml = `
      <table>
        <thead><tr>${header.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`
    const blob = new Blob([`<html><head><meta charset="utf-8"></head><body>${tableHtml}</body></html>`], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'stock-report.xls'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="card stock-report-page">
      <div className="card-header">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>STOCK REPORT</div>
          <div style={{ marginTop: 6, color: 'var(--color-muted)' }}><em>* STOCK VALUE IS CALCULATED ON UNIT PURCHASE AMOUNT (INCLUDING TAX).</em></div>
        </div>
        <div className="header-right">
          <div className="stock-kpis" style={{ display: 'flex', gap: 12 }}>
            <div className="kpi-card" style={{ background: '#ef9a1a', color: 'white', padding: 12, minWidth: 120 }}>
              <div style={{ fontSize: 12 }}>LOW STOCK</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{kpis.low_stock}</div>
            </div>
            <div className="kpi-card" style={{ background: '#ef4444', color: 'white', padding: 12, minWidth: 120 }}>
              <div style={{ fontSize: 12 }}>OUT OF STOCK</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{kpis.out_of_stock}</div>
            </div>
            <div className="kpi-card" style={{ background: '#8b2626', color: 'white', padding: 12, minWidth: 120 }}>
              <div style={{ fontSize: 12 }}>EXPIRED BATCHES</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{kpis.expired_batches}</div>
            </div>
          </div>

          <div className="controls-row" style={{ marginTop: 8 }}>
            <div className="controls-left">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ color: 'var(--color-muted)' }}>Search:</label>
                <input value={query} onChange={e => setQuery(e.target.value)} />
              </div>
            </div>
            <div className="controls-right">
              <button className="btn" onClick={onPrint}>Print Report</button>
              <button className="btn success" onClick={downloadXLSX}>Download XLS</button>
            </div>
          </div>
        </div>
      </div>
      
      <div style={{ padding: 12 }}>

        <div className="table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>Sl.No.</th>
                <th>Item Name</th>
                <th>Item Code</th>
                <th>HSN</th>
                <th>MRP</th>
                <th>Purchased Price</th>
                <th>Selling Price</th>
                <th>TAX</th>
                <th>Purchased Quantity</th>
                <th>Stock</th>
                <th>Unit</th>
                <th>Stock Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 24 }}>Loading...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 24 }}>No data</td></tr>
              ) : (
                        pageItems.map((row, i) => (
                          <tr key={row.id} className={i % 2 === 0 ? '' : 'row-odd'}>
                            <td>{(page - 1) * perPage + i + 1}</td>
                    <td style={{ whiteSpace: 'normal' }}>{row.name}</td>
                    <td>{row.code}</td>
                    <td>{row.hsn || '-'}</td>
                    <td>{row.mrp}</td>
                    <td>{row.purchased_price}</td>
                    <td>{row.selling_price}</td>
                    <td>{row.tax}</td>
                    <td>{row.purchased_qty}</td>
                    <td>{row.stock}</td>
                    <td>{row.unit}</td>
                    <td>{row.stock_value}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>Showing {total === 0 ? 0 : (page - 1) * perPage + 1} to {Math.min(page * perPage, total)} of {total} entries</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              Show{' '}
              <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}>
                {[5,10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>{' '}entries
            </div>
            <div className="pagination">
              <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
              {Array.from({ length: Math.min(7, pages) }).map((_, idx) => {
                const start = Math.max(1, Math.min(page - 3, pages - 6))
                const p = Math.min(pages, start + idx)
                return <button key={p} className={`btn small ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              })}
              <button className="btn" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>Next</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
