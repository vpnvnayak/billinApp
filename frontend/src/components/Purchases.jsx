import React, { useEffect, useState } from 'react'
import api from '../services/api'
import PaginationFooter from './ui/PaginationFooter'
import * as ui from '../services/ui'

export default function Purchases() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [entries, setEntries] = useState(10)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  // New purchase modal state
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [form, setForm] = useState({ invoice_no: '', date: new Date().toISOString().slice(0,10), arrival_date: new Date().toISOString().slice(0,10), state: '', gst_type: 'GST', total_amount: 0, supplier_id: '', supplier_name: '' })
  const [items, setItems] = useState([]) // line items for modal
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchList() }, [])
  useEffect(() => { if (newPurchaseOpen) fetchSuppliers() }, [newPurchaseOpen])
  async function fetchList() {
    setLoading(true); setError(null)
    try {
      const r = await api.get('/purchases')
      setList(r.data || [])
    } catch (e) { console.error(e); setError('Failed to load purchases') } finally { setLoading(false) }
  }

  async function fetchSuppliers() {
    try {
      const r = await api.get('/suppliers')
      const data = (r && r.data && (Array.isArray(r.data) ? r.data : (r.data.data || []))) || []
      setSuppliers(data)
    } catch (e) { console.error('Failed to load suppliers', e); setSuppliers([]) }
  }

  function openNewPurchase() {
    setForm({ invoice_no: '', date: new Date().toISOString().slice(0,10), arrival_date: new Date().toISOString().slice(0,10), state: '', gst_type: 'GST', total_amount: 0, supplier_id: '', supplier_name: '' })
    setItems([])
    setNewPurchaseOpen(true)
  }

  function closeNewPurchase() { setNewPurchaseOpen(false) }

  async function submitPurchase() {
    try {
      // validation
      if (!form.supplier_id) return ui.showAlert('Please select or create a supplier', 'Validation')
      if (!items || items.length === 0) return ui.showAlert('Please add at least one item', 'Validation')
      setSaving(true)
      const payload = { ...form, items }
      const r = await api.post('/purchases', payload)
      if (r && (r.status === 200 || r.status === 201)) {
        ui.showSnackbar('Purchase created', 'success')
        closeNewPurchase()
        fetchList()
        try {
          const created = r.data
          const id = created && created.id
          if (id && typeof window !== 'undefined' && window.__appNavigate) {
            window.__appNavigate(`/purchases/${id}`)
          } else if (id) {
            try { window.history.pushState(null, '', `/purchases/${id}`) } catch (e) {}
            window.location.reload()
          }
        } catch (e) { /* ignore navigation errors */ }
      } else {
        ui.showAlert('Failed to create purchase')
      }
    } catch (e) { console.error(e); ui.showAlert('Failed to create purchase: ' + (e.message || '')) } finally { setSaving(false) }
  }

  async function createSupplier() {
    try {
      if (!newSupplierName || !newSupplierName.trim()) return ui.showAlert('Please enter supplier name')
      const r = await api.post('/suppliers', { name: newSupplierName.trim() })
      if (r && (r.status === 200 || r.status === 201)) {
        const created = r.data
        setSuppliers(s => [...(s || []), created])
        setForm(f => ({ ...f, supplier_id: created.id, supplier_name: created.name || newSupplierName.trim() }))
        setNewSupplierName('')
        setSupplierModalOpen(false)
        ui.showSnackbar('Supplier created', 'success')
      } else {
        ui.showAlert('Failed to create supplier')
      }
    } catch (e) { console.error(e); ui.showAlert('Failed to create supplier: ' + (e.message || '')) }
  }

  const filteredAll = (list || []).filter(p => {
    const q = (search || '').trim().toLowerCase()
    if (!q) return true
    const no = (p.metadata && (p.metadata.purchase_no || p.purchase_no)) || p.id
    const desc = (p.metadata && p.metadata.description) || ''
    return String(no).toLowerCase().includes(q) || (p.supplier_name || '').toLowerCase().includes(q) || (desc || '').toLowerCase().includes(q)
  })

  const start = ((page || 1) - 1) * (entries || 10)
  const filtered = filteredAll.slice(start, start + (entries || 10))

  return (
    <div className="page purchases-page">

      <div className="page-header" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="search-box">Search: <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></div>
        </div>
        <div className="page-header-actions">
          <button className="btn success" onClick={() => { if (window && window.__appNavigate) window.__appNavigate('/purchases/new'); else { try { window.history.pushState(null, '', '/purchases/new') } catch (e) {} window.location.reload() } }}>+ Add Purchase</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Purchases</div>
          <div className="kpi-value">{list.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Spend</div>
          <div className="kpi-value">{(() => {
            const total = (list || []).reduce((s, it) => s + (Number(it.total_amount) || 0), 0)
            return `₹ ${Number(total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          })()}</div>
          <div className="kpi-meta">aggregate</div>
        </div>
      </div>

      <div className="card">
        {loading && <div className="app-loader"><div><div className="loader" aria-hidden></div><div className="loader-text">Loading purchases…</div></div></div>}
        {error && <div className="error">{error}</div>}
        <div className="users-table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>Sl.No.</th>
                <th>Date</th>
                <th>Purchase No.</th>
                <th>Supplier</th>
                <th>Net Amount</th>
            {/* Line items editor (inside modal) */}
                <th>Expence</th>
                <th>Description</th>
                <th>Print</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && <tr><td colSpan={9}>No purchases found</td></tr>}
              {(filtered || []).map((p, i) => {
                const no = (p.metadata && (p.metadata.purchase_no || p.purchase_no)) || p.id
                const desc = (p.metadata && p.metadata.description) || ''
                const expense = (p.metadata && (Number(p.metadata.expense) || 0)) || 0
                return (
                  <tr key={p.id}>
                    <td>{i+1}</td>
                    <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</td>
                    <td>{no}</td>
                    <td>{p.supplier_name || '-'}</td>
                    <td>{p.total_amount ? `₹ ${Number(p.total_amount).toLocaleString('en-IN')}` : '₹ 0.00'}</td>
                    <td>{expense ? `${expense}` : '0'}</td>
                    <td>{desc}</td>
                    <td>
                      <button className="btn small" style={{ marginRight: 6 }}>Bill</button>
                      <button className="btn small">View</button>
                    </td>
                    <td><button className="btn small" onClick={() => { if (window && window.__appNavigate) window.__appNavigate(`/purchases/${p.id}`); else { try { window.history.pushState(null, '', `/purchases/${p.id}`) } catch (e) {} window.location.reload() } }}>✎</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ padding: '8px 16px' }}>
        <PaginationFooter total={list.length} page={page} pageSize={entries} onPageChange={p => setPage(p)} onPageSizeChange={s => { setEntries(s); setPage(1) }} />
      </div>

      {/* New Purchase Modal (standardized layout) */}
      {newPurchaseOpen && (
        <div className="modal-overlay">
          <div className="modal large-modal">
            <div className="modal-header">
              <h3>New Purchase</h3>
              <button className="btn btn-ghost" onClick={() => closeNewPurchase()}>Close</button>
            </div>

            <div className="modal-grid">
              <div className="field">
                <label className="field-label">Invoice Number</label>
                <input value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} />
              </div>

              <div className="field">
                <label className="field-label">Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label">Arrival Date</label>
                <input type="date" value={form.arrival_date} onChange={e => setForm({ ...form, arrival_date: e.target.value })} />
              </div>

              <div className="field">
                <label className="field-label">State</label>
                <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label">GST Type</label>
                <select value={form.gst_type} onChange={e => setForm({ ...form, gst_type: e.target.value })}>
                  <option>GST</option>
                  <option>IGST</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label">Total Bill Value</label>
                <input type="number" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">Supplier</label>
                <div style={{ display: 'flex', gap: 8 }}> 
                  <select value={form.supplier_id || ''} onChange={e => {
                    const id = e.target.value
                    const s = suppliers.find(x => String(x.id) === String(id)) || {}
                    setForm({ ...form, supplier_id: id, supplier_name: s.name || '' })
                  }} style={{ flex: 1 }}>
                    <option value="">Select Supplier</option>
                    {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name || s.supplier_name || s.display_name || `#${s.id}`}</option>)}
                  </select>
                  <button className="btn success" onClick={() => setSupplierModalOpen(true)}>New!</button>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => closeNewPurchase()}>Cancel</button>
              <button className="btn primary" disabled={saving} onClick={() => submitPurchase()}>{saving ? 'Saving...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier create modal (standardized) */}
      {supplierModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>New Supplier</h3>
              <button className="btn btn-ghost" onClick={() => setSupplierModalOpen(false)}>Close</button>
            </div>
            <div className="field">
              <label className="field-label">Supplier Name</label>
              <input value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setSupplierModalOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={() => createSupplier()}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
