import React, { useEffect, useState } from 'react'
import api from '../services/api'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'

export default function Suppliers() {
  const [list, setList] = useState([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [execName, setExecName] = useState('')
  const [phone1, setPhone1] = useState('')
  const [phone2, setPhone2] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [tin, setTin] = useState('')
  const [stateValue, setStateValue] = useState('Kerala')
  const [creditDue, setCreditDue] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState(10)
  const [page, setPage] = useState(1)
  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/suppliers/aggregates')
      const rows = res.data || []
      const mapped = rows.map(r => ({
        id: r.supplier_id,
        name: r.name,
        phone: r.phone || null,
        phone1: r.phone1 || null,
        phone2: r.phone2 || null,
        email: r.email || null,
        website: r.website || null,
        total_purchases: Number(r.total_purchases) || 0,
        credit_due: Number(r.credit_due) || 0,
        // format last_purchase as a readable string to avoid passing Date objects into JSX
        last_purchase: r.last_purchase ? (new Date(r.last_purchase)).toLocaleString('en-IN') : null,
        created_at: r.created_at || null
      }))
      setList(mapped)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!mounted) return
      await load()
    })()
    return () => { mounted = false }
  }, [])

  async function create() {
    try {
      setLoading(true)
      const payload = {
        name: name.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        executive_name: execName.trim() || null,
        phone1: phone1.trim() || null,
        phone2: phone2.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        tin_gstin: tin.trim() || null,
        state: stateValue || null,
        credit_due: Number(creditDue) || 0
      }
      let r
      if (editId) {
        r = await api.put(`/suppliers/${editId}`, payload)
      } else {
        r = await api.post('/suppliers', payload)
      }
      // reset inputs
      setName(''); setPhone(''); setEmail(''); setWebsite(''); setExecName(''); setPhone1(''); setPhone2(''); setAddress(''); setCity(''); setTin(''); setStateValue('Kerala'); setCreditDue(0)
      await load()
      setShowCreate(false)
      setEditId(null)
    } catch (e) {
      console.error(e)
      import('../services/ui').then(m => m.showAlert('Failed to create'))
    } finally {
      setLoading(false)
    }
  }

  function filtered() {
    const q = (search || '').trim().toLowerCase()
    let res = list
    if (q) res = list.filter(c => (c.name || '').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.phone||'').toLowerCase().includes(q))
    const start = ((page || 1) - 1) * (entries || 10)
    return res.slice(start, start + (entries || 10))
  }

  function openEdit(s) {
    setEditId(s.id)
    setName(s.name || '')
    setPhone(s.phone || s.phone1 || '')
    setEmail(s.email || '')
    setWebsite(s.website || '')
    setExecName(s.executive_name || '')
    setPhone1(s.phone1 || '')
    setPhone2(s.phone2 || '')
    setAddress(s.address || '')
    setCity(s.city || '')
    setTin(s.tin_gstin || '')
    setCreditDue(s.credit_due || 0)
    setStateValue(s.state || 'Kerala')
    setShowCreate(true)
  }

  async function removeSupplier(id) {
    try {
      const ok = await import('../services/ui').then(m => m.showConfirm('Delete supplier?'))
      if (!ok) return
      await api.delete(`/suppliers/${id}`)
      await load()
      import('../services/ui').then(m => m.showSnackbar('Supplier deleted', 'info'))
    } catch (e) { console.error(e); import('../services/ui').then(m => m.showAlert('Failed to delete')) }
  }

  return (
    <div className="page contacts-page">
      <div className="page-header">
        <div className="page-header-actions">
          <button className="btn success add-customer-btn" onClick={() => setShowCreate(true)}>+ Add Supplier</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Suppliers</div>
          <div className="kpi-value">{list.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Purchases</div>
          <div className="kpi-value">{(() => {
            const total = (list || []).reduce((s, it) => s + (Number(it.total_purchases) || 0), 0)
            return `₹ ${Number(total).toLocaleString('en-IN')}`
          })()}</div>
          <div className="kpi-meta">aggregate purchases</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Average Purchase</div>
          <div className="kpi-value">{(() => {
            const total = (list || []).reduce((s, it) => s + (Number(it.total_purchases) || 0), 0)
            const avg = list.length ? total / list.length : 0
            return `₹ ${Number(avg).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
          })()}</div>
          <div className="kpi-meta">per supplier</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">New Suppliers</div>
          <div className="kpi-value">{(() => {
            try {
              const now = Date.now()
              const days30 = 1000 * 60 * 60 * 24 * 30
              const count = (list || []).filter(it => it.created_at && (now - new Date(it.created_at).getTime()) <= days30).length
              return count
            } catch (e) { return 0 }
          })()}</div>
          <div className="kpi-meta">last 30 days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Credit</div>
          <div className="kpi-value">{(() => {
            const totalCredit = (list || []).reduce((s, it) => s + (Number(it.credit_due) || 0), 0)
            return `₹ ${Number(totalCredit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          })()}</div>
          <div className="kpi-meta">credit to be paid</div>
        </div>
        {/* KPI cards end */}
      </div>

      <div className="card customers-card">
        <div style={{ padding: '12px 16px' }}>
          <ListControls searchValue={search} onSearchChange={v => { setSearch(v); setPage(1) }} />
        </div>

        <div className="users-table-wrap">
          <table className="products-table customers-table">
            <thead>
              <tr>
                <th className="avatar-cell">Name</th>
                <th className="phone-cell">Phone</th>
                <th className="email-cell">Email</th>
                <th className="purchases-cell">Total Purchases</th>
                <th className="credit-cell">Credit</th>
                <th className="last-purchase-cell">Last Purchase</th>
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
                  <td className="phone-cell">{c.phone1 || '-'}</td>
                  <td className="email-cell">{c.email || '-'}</td>
                  <td className="purchases-cell">{c.total_purchases ? `₹ ${Number(c.total_purchases).toLocaleString('en-IN')}` : '₹ 0.00'}</td>
                  <td className="credit-cell">{c.credit_due ? `₹ ${Number(c.credit_due).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹ 0.00'}</td>
                  <td className="last-purchase-cell">{c.last_purchase || '-'}</td>
                  <td className="actions">
                    <div className="row-actions">
                      <button className="btn btn-ghost" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn small" onClick={() => removeSupplier(c.id)} style={{ marginLeft: 8, background: 'var(--color-danger)' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered().length === 0 && (
                <tr><td colSpan={7}>No suppliers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 16px' }}>
          <PaginationFooter total={list.length} page={page} pageSize={entries} onPageChange={p => setPage(p)} onPageSizeChange={s => { setEntries(s); setPage(1) }} />
        </div>
      </div>

      {showCreate && (
        <div className="modal-overlay">
          <div className="modal large-modal">
              <div className="modal-header">
                <h3>{editId ? 'Edit Supplier' : 'Add Supplier'}</h3>
                <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setName(''); setPhone(''); setEmail(''); setWebsite(''); setExecName(''); setPhone1(''); setPhone2(''); setAddress(''); setCity(''); setTin(''); setStateValue('Kerala'); setEditId(null); setCreditDue(0) }}>Close</button>
              </div>
              <div className="modal-grid">
              <div className="field">
                <label className="field-label">Company Name</label>
                <input placeholder="Company Name" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Phone</label>
                <input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>

              <div className="field">
                <label className="field-label">Email</label>
                <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Website</label>
                <input placeholder="Website" value={website} onChange={e => setWebsite(e.target.value)} />
              </div>

              <div className="field">
                <label className="field-label">Executive Name</label>
                <input placeholder="Executive Name" value={execName} onChange={e => setExecName(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Phone 1</label>
                <input placeholder="Phone 1" value={phone1} onChange={e => setPhone1(e.target.value)} />
              </div>

              <div className="field">
                <label className="field-label">Credit to be Paid</label>
                <input placeholder="0.00" value={creditDue} onChange={e => setCreditDue(e.target.value)} />
              </div>

              <div className="field">
                <label className="field-label">Phone 2</label>
                <input placeholder="Phone 2" value={phone2} onChange={e => setPhone2(e.target.value)} />
              </div>
              <div className="field address-field">
                <label className="field-label">Address</label>
                <textarea placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} />
              </div>

              <div className="field">
                <label className="field-label">City</label>
                <input placeholder="City" value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">TIN/GSTIN</label>
                <input placeholder="TIN/GSTIN" value={tin} onChange={e => setTin(e.target.value)} />
              </div>

              <div className="field">
                <label className="field-label">State</label>
                <select value={stateValue} onChange={e => setStateValue(e.target.value)}>
                  <option>Kerala</option>
                  <option>Tamil Nadu</option>
                  <option>Karnataka</option>
                  <option>Andhra Pradesh</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn primary" onClick={create} disabled={loading}>{loading ? 'Saving...' : (editId ? 'Save changes' : 'Create')}</button>
              <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setName(''); setPhone(''); setEmail(''); setWebsite(''); setExecName(''); setPhone1(''); setPhone2(''); setAddress(''); setCity(''); setTin(''); setStateValue('Kerala'); setCreditDue(0) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
