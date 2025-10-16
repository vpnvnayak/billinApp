import React, { useState, useEffect, useMemo } from 'react'
import api from '../services/api'
import { printThermal, registerPrintHandlers } from '../services/print'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'

export default function Sales() {
  const [outlet, setOutlet] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [gst, setGst] = useState('All')
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState(5)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSale, setModalSale] = useState(null)

  // safe formatter to avoid runtime errors when values are undefined/null/strings
  const fmt = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return '0.00'
    return n.toFixed(2)
  }

  async function fetchSales(params = {}) {
    setLoading(true)
    try {
      const p = { ...params }
      if (from) p.from = from
      if (to) p.to = to
      if (outlet) p.outlet = outlet
      if (type) p.type = type
      if (paymentMethod) p.paymentMethod = paymentMethod
      const r = await api.get('/sales', { params: p })
      setSales(r.data || [])
    } catch (err) {
      console.error(err)
      setSales([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchSales() }, [])
  // register global print handlers so other parts of the app can use window.printThermal
  useEffect(() => { registerPrintHandlers && registerPrintHandlers() }, [])

  const filtered = useMemo(() => {
    if (!search) return sales
    const q = search.toLowerCase()
    return sales.filter(s => {
      const parts = []
      parts.push(String(s.id || ''))
      parts.push(`GCK${s.id || ''}`)
      if (s.grand_total != null) parts.push(String(s.grand_total))
      if (s.created_at) parts.push(String(s.created_at))
      if (s.type) parts.push(String(s.type))
      if (s.payment_method) parts.push(String(s.payment_method))
      if (s.metadata) parts.push(JSON.stringify(s.metadata))
      const hay = parts.join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [sales, search])

  const totalAmount = useMemo(() => filtered.reduce((sum, s) => sum + (Number(s.grand_total) || 0), 0), [filtered])

  function onSearchKey(e) {
    if (e.key === 'Enter') {
      setSearch(searchInput.trim())
    }
  }

  async function downloadXls(type) {
    // placeholder: request server export when available. For now just console log
  import('../services/ui').then(m => m.showSnackbar('Download ' + type + ' - not implemented', 'info'))
  }

  function calcAging(createdAt) {
    try {
      const d1 = new Date(createdAt)
      const d2 = new Date()
      const diff = Math.floor((d2 - d1) / (1000*60*60*24))
      return diff
    } catch (e) { return 0 }
  }

  // helper to extract customer info from possible metadata shapes
  function getCustomerInfo(sale) {
    let meta = sale && sale.metadata
    if (!meta) return { name: '', phone: '', email: '' }
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta) } catch (e) { /* leave as string */ }
    }
    // common shapes: { customer_name, customer_phone, customer_email }
    // or nested: { customer: { name, phone, email } }
  const name = sale.metadata_customer_name || meta.customer_name || (meta.customer && (meta.customer.name || meta.customer.customer_name)) || meta.name || ''
  const phone = sale.metadata_customer_phone || meta.customer_phone || (meta.customer && (meta.customer.phone || meta.customer.mobile)) || meta.phone || ''
  const email = sale.metadata_customer_email || meta.customer_email || (meta.customer && meta.customer.email) || meta.email || ''
    return { name, phone, email }
  }

  const startIndex = ((page || 1) - 1) * (entries || 5)
  const displayed = filtered.slice(startIndex, startIndex + (entries || 5))

  return (
    <div className="page">
      <h2>Sales</h2>

      <section className="card sales-filter" style={{ padding: 18, marginBottom: 12 }}>
        <h3 className="sales-filter-title">FILTER BY DATES</h3>
        <div className="sales-filter-row">
          <div className="form-group form-outlet">
            <label>Choose Outlet</label>
            <select value={outlet} onChange={e => setOutlet(e.target.value)}>
              <option value="">GROCA KUNDAMANKADAV</option>
            </select>
          </div>

          <div className="form-group">
            <label>From Date</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>

          <div className="form-group">
            <label>To Date</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Type</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="">B2C</option>
            </select>
          </div>

          <div className="form-group">
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="">Payment Method</option>
            </select>
          </div>

          <div className="form-group gst-group">
            <label>GST/NON GST</label>
            <select value={gst} onChange={e => setGst(e.target.value)}>
              <option>All</option>
            </select>
          </div>

          <div className="form-group form-filter">
            <button className="btn filter-btn" onClick={() => fetchSales()} disabled={loading}>{loading ? 'Loading...' : 'Filter'}</button>
          </div>
        </div>
      </section>
      <section className="card" style={{ padding: 18 }}>
        <div className="card-header" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>DATE WISE SALES REPORTS</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button className="btn success" onClick={() => downloadXls('Est')}>Download Est XLS</button>
            <button className="btn success" onClick={() => downloadXls('1%')}>Download 1% XLS</button>
            <button className="btn success" onClick={() => downloadXls('SP')}>Download SP XLS</button>
            <button className="btn success" onClick={() => downloadXls('NEW')}>Download NEW XLS</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <ListControls searchValue={searchInput} onSearchChange={v => setSearchInput(v)} />
            </div>
            <div className="card-header-right">
              <div className="total" style={{ fontSize: 14 }}>TOTAL RS.<div className="big" style={{ fontSize: 28, fontWeight: 800, display: 'inline-block', marginLeft: 6 }}>{fmt(totalAmount)}</div>/ -</div>
              <div className="card-header-controls" style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => { setSearch(searchInput.trim()); setPage(1) }}>Search</button>
                  <button className="btn" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}>Clear</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 8 }} />

        <div className="sales-table">
          <table className="table">
            <thead>
              <tr>
                <th>Sl.No.</th>
                <th>Date</th>
                <th>Bill No.</th>
                <th>Time</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Location</th>
                <th>Payment</th>
                <th>Bill Amount</th>
                <th>Paid</th>
                <th>Cash</th>
                <th>Card</th>
                <th>UPI</th>
                <th>Other</th>
                <th>Profit</th>
                <th>Options</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((s, i) => (
                <tr key={s.id}>
                  <td>{i+1}</td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>{`GCK${s.id}`}</td>
                  <td>{new Date(s.created_at).toLocaleTimeString()}</td>
                  {
                    (() => {
                      const c = getCustomerInfo(s)
                      return <>
                        <td>{c.name || ''}</td>
                        <td>{c.phone || ''}</td>
                        <td>{c.email || ''}</td>
                      </>
                    })()
                  }
                  <td>{(s.metadata && s.metadata.location) || ''}</td>
                  <td>{s.payment_method || ((s.metadata && s.metadata.payment_method) || '')}</td>
                  <td>{s.grand_total}</td>
                  <td>{(s.metadata && ((s.metadata.cash||0) + (s.metadata.card||0) + (s.metadata.upi||0) + (s.metadata.other||0))) || 0}</td>
                  <td>{(s.metadata && (s.metadata.cash || 0)) || 0}</td>
                  <td>{(s.metadata && (s.metadata.card || 0)) || 0}</td>
                  <td>{(s.metadata && (s.metadata.upi || 0)) || 0}</td>
                  <td>{(s.metadata && (s.metadata.other || 0)) || 0}</td>
                  <td>{(s.metadata && s.metadata.profit) || ''}</td>
                  <td className="actions">
                    {/* Print icon */}
                    <button className="icon-btn" title="Print" aria-label={`Print sale ${s.id}`} onClick={async () => {
                      try {
                        const r = await api.get(`/sales/${s.id}`)
                        let payload = r.data
                        if (r.data && r.data.sale) {
                          payload = { ...r.data.sale, sale_items: r.data.items || [] }
                        }
                        try { printThermal(payload) } catch (e) { console.error('print error', e); import('../services/ui').then(m => m.showAlert('Error executing print function')) }
                      } catch (err) { console.error(err); import('../services/ui').then(m => m.showAlert('Failed to fetch sale for printing')) }
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9V3h12v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><rect x="3" y="9" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 13h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>

                    {/* View icon */}
                    <button className="icon-btn" title="View" aria-label={`View sale ${s.id}`} onClick={async () => {
                      try {
                        const r = await api.get(`/sales/${s.id}`)
                        let payload = r.data
                        if (r.data && r.data.sale) {
                          payload = { ...r.data.sale, sale_items: r.data.items || [] }
                        }
                        setModalSale(payload)
                        setModalOpen(true)
                      } catch (err) { console.error(err); import('../services/ui').then(m => m.showAlert('Failed to fetch sale details')) }
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>

                    {/* Edit icon */}
                    <button className="icon-btn" title="Edit" aria-label={`Edit sale ${s.id}`} onClick={() => {
                      if (window && window.__openSaleEdit) return window.__openSaleEdit(s.id)
                      if (window && window.__appNavigate) return window.__appNavigate(`/sales/${s.id}/edit`)
                      import('../services/ui').then(m => m.showAlert('Edit not implemented'))
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 21v-3.75L14.81 5.44a2.12 2.12 0 0 1 3 0l1.75 1.75a2.12 2.12 0 0 1 0 3L8.5 21H3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '8px 16px' }}>
          <PaginationFooter total={sales.length} page={page} pageSize={entries} onPageChange={p => { setPage(p); }} onPageSizeChange={s => { setEntries(s); setPage(1) }} />
        </div>

        {modalOpen && modalSale && (
          <div className="modal-backdrop" style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div className="modal" style={{ width: '90%', maxWidth: 900 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Sale Details - {`GCK${modalSale.id}`}</h3>
                <div>
                  <button className="btn" onClick={() => { setModalOpen(false); setModalSale(null) }}>Close</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div><strong>Date:</strong> {new Date(modalSale.created_at).toLocaleString()}</div>
                  <div><strong>Customer:</strong> {(getCustomerInfo(modalSale).name) || 'N/A'}</div>
                  <div><strong>Location:</strong> {(modalSale.metadata && modalSale.metadata.location) || 'N/A'}</div>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div><strong>Bill Amount:</strong> Rs. {fmt(modalSale.grand_total)}</div>
                  <div><strong>Paid:</strong> Rs. {fmt((modalSale.metadata && ((modalSale.metadata.cash||0) + (modalSale.metadata.card||0) + (modalSale.metadata.upi||0))) || 0)}</div>
                  <div><strong>Profit:</strong> Rs. {fmt((modalSale.metadata && modalSale.metadata.profit) || 0)}</div>
                </div>
              </div>

              <hr />

              <div>
                <h4>Items</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(modalSale.sale_items || []).map((it, idx) => (
                        <tr key={idx}>
                          <td>{idx+1}</td>
                          <td>{(it.product && it.product.name) || (it.name) || (it.product_name) || 'Item'}</td>
                          <td>{it.quantity || it.qty || 1}</td>
                          <td>{(it.unit_price || it.price || it.rate) || ''}</td>
                          <td>{(it.line_total || (it.quantity * (it.unit_price||it.price||it.rate))) || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <hr />

              <div>
                <h4>Payment Breakdown</h4>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 140 }}><strong>Cash:</strong> Rs. {(modalSale.metadata && modalSale.metadata.cash) || 0}</div>
                  <div style={{ minWidth: 140 }}><strong>Card:</strong> Rs. {(modalSale.metadata && modalSale.metadata.card) || 0}</div>
                  <div style={{ minWidth: 140 }}><strong>UPI:</strong> Rs. {(modalSale.metadata && modalSale.metadata.upi) || 0}</div>
                  <div style={{ minWidth: 140 }}><strong>Other:</strong> Rs. {(modalSale.metadata && modalSale.metadata.other) || 0}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
