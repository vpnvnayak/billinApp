import React, { useEffect, useState } from 'react'
import api from '../services/api'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'

export default function Customers() {
  const [list, setList] = useState([])
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
        setList(r.data.data)
        setTotal(r.data.total || 0)
      } else {
        setList(r.data || [])
        setTotal((r.data && r.data.length) || 0)
      }
    } catch (e) { console.error(e); setList([]); setTotal(0) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, entries, search])

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
          <div className="kpi-value">{list.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active Customers</div>
          <div className="kpi-value">320</div>
          <div className="kpi-meta">the last 30 days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Average Spend</div>
          <div className="kpi-value">₹150</div>
          <div className="kpi-meta">per customer</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">New Customers</div>
          <div className="kpi-value">45</div>
          <div className="kpi-meta">last 30 days</div>
        </div>
        <div className="kpi-right">
          <div className="kpi-card">
            <div className="kpi-label">Loyalty Program Members</div>
            <div className="kpi-value">36</div>
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
                  <td className="loyalty-cell">{c.loyalty_points ? `${c.loyalty_points} points` : '0 points'}</td>
                  <td className="actions">
                    <div className="row-actions">
                      <button className="btn btn-ghost">Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered().length === 0 && (
                <tr><td colSpan={6}>No customers found</td></tr>
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
