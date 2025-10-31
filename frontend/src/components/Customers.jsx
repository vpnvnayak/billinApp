import React, { useEffect, useState } from 'react'
import api from '../services/api'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'
import { useUI } from './ui/UIProvider'

export default function Customers() {
  const [list, setList] = useState([])
  const [kpis, setKpis] = useState({ total_customers: 0, active_customers_30d: 0, avg_spend: 0, new_customers_30d: 0, loyalty_members: 0 })
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState(10)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  async function load() {
    try {
      setLoading(true)
      const params = { page, limit: entries }
      if (search) params.q = search
      const r = await api.get('/customers', { params })
      if (r.data && Array.isArray(r.data.data)) {
        // map and format aggregated fields for display (keep numeric values as numbers)
        const mapped = r.data.data.map(rw => ({
          ...rw,
          total_purchases: Number(rw.total_purchases) || 0,
          credit_due: Number(rw.credit_due) || 0,
          // format last_purchase similar to suppliers list to avoid Date objects in JSX
          last_purchase: rw.last_purchase ? (new Date(rw.last_purchase)).toLocaleString('en-IN') : null
        }))
        setList(mapped)
        setTotal(r.data.total || 0)
      } else {
        setList(r.data || [])
        setTotal((r.data && r.data.length) || 0)
      }
    } catch (e) { console.error(e); setList([]); setTotal(0) } finally { setLoading(false) }
  }

  async function loadKpis() {
    try {
      const r = await api.get('/customers/aggregates')
      if (r && r.data) {
        setKpis({
          total_customers: Number(r.data.total_customers || 0),
          active_customers_30d: Number(r.data.active_customers_30d || 0),
          avg_spend: Number(r.data.avg_spend || 0),
          new_customers_30d: Number(r.data.new_customers_30d || 0),
          loyalty_members: Number(r.data.loyalty_members || 0)
        })
      }
    } catch (e) {
      console.error('failed to load customer kpis', e)
      setKpis({ total_customers: 0, active_customers_30d: 0, avg_spend: 0, new_customers_30d: 0, loyalty_members: 0 })
    }
  }

  const { selectedStore } = useUI() || {}

  // reload when paging/search changes or when the selected store changes
  useEffect(() => { load(); loadKpis() }, [page, entries, search, selectedStore])

  // listen for global events so other parts of the app can trigger a refresh
  useEffect(() => {
    const handler = () => { setPage(1); load() }
    try {
      window.addEventListener('customers:changed', handler)
      window.addEventListener('store:changed', handler)
    } catch (e) {}
    return () => {
      try {
        window.removeEventListener('customers:changed', handler)
        window.removeEventListener('store:changed', handler)
      } catch (e) {}
    }
  }, [selectedStore])

  async function create() {
    if (!name.trim()) return import('../services/ui').then(m => m.showAlert('Name is required'))
    try {
      setLoading(true)
      const r = await api.post('/customers', { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null })
      setName(''); setPhone(''); setEmail('')
      // refresh list
      await load()
      // dispatch an event so other components (POS) can refresh
      try { window.dispatchEvent(new CustomEvent('customers:changed')) } catch (e) {}
      setShowCreate(false)
  } catch (e) { console.error(e); import('../services/ui').then(m => m.showAlert('Failed to create')) } finally { setLoading(false) }
  }

  function filtered() {
    return list
  }

  return (
  <div className="page contacts-page">
      <div className="page-header">
        <div className="page-header-actions">
          <button className="btn success add-customer-btn" onClick={() => setShowCreate(true)}>+ Add Customer</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Customers</div>
          <div className="kpi-value">{kpis.total_customers}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active Customers</div>
          <div className="kpi-value">{kpis.active_customers_30d}</div>
          <div className="kpi-meta">the last 30 days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Average Spend</div>
          <div className="kpi-value">₹{Number(kpis.avg_spend || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="kpi-meta">per customer</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">New Customers</div>
          <div className="kpi-value">{kpis.new_customers_30d}</div>
          <div className="kpi-meta">last 30 days</div>
        </div>
        <div className="kpi-right">
          <div className="kpi-card">
            <div className="kpi-label">Loyalty Program Members</div>
            <div className="kpi-value">{kpis.loyalty_members}</div>
          </div>
        </div>
      </div>

      {/* moved search into the card header to avoid duplication */}

      <div className="card customers-card">
        <div style={{ padding: '12px 16px' }}>
          <ListControls searchValue={search} onSearchChange={v => { setSearch(v); setPage(1) }} />
        </div>

  <div className="users-table-wrap">
          <table className="products-table customers-table">
            <thead>
              <tr>
                <th className="avatar-cell">Name</th>
                <th className="email-cell">Email</th>
                <th className="purchases-cell">Total Purchases</th>
                <th className="last-purchase-cell">Last Purchase</th>
                <th className="credit-cell">Credit</th>
                <th className="loyalty-cell">Loyalty Points</th>
                <th className="actions"> </th>
              </tr>
            </thead>
            <tbody>
              {filtered().map((c, i) => (
                <tr key={c.id} className="customer-row">
                  <td className="avatar-cell">
                    <div className="row-avatar">
                      <div className="avatar table-avatar">{(c.name||'').charAt(0).toUpperCase()}</div>
                      <div className="table-name">
                        <div className="name-strong">{c.name}</div>
                        <div className="name-sub">{c.phone || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="email-cell">{c.email || '-'}</td>
                  <td className="purchases-cell">{c.total_purchases ? `₹ ${Number(c.total_purchases).toLocaleString('en-IN')}` : '₹ 0.00'}</td>
                  <td className="last-purchase-cell">{c.last_purchase || '-'}</td>
                  <td className="credit-cell">{c.credit_due ? `₹ ${Number(c.credit_due).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹ 0.00'}</td>
                  <td className="loyalty-cell">{c.loyalty_points ? `${c.loyalty_points} points` : '0 points'}</td>
                  <td className="actions">
                    <div className="row-actions">
                      <button className="btn btn-ghost">Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered().length === 0 && (
                <tr><td colSpan={7}>No customers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 16px' }}>
          <PaginationFooter total={total} page={page} pageSize={entries} onPageChange={p => { setPage(p); }} onPageSizeChange={s => { setEntries(s); setPage(1) }} />
        </div>
      </div>

      {showCreate && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create customer</h3>
            <div className="field">
              <label className="field-label">Name</label>
              <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Phone</label>
              <input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Email</label>
              <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={create} disabled={loading}>{loading ? 'Saving...' : 'Create'}</button>
              <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setName(''); setPhone(''); setEmail('') }}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
