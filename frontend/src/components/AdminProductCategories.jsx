import React, { useEffect, useState } from 'react'
import api from '../services/api'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'

export default function AdminProductCategories() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)

  useEffect(() => { fetchCategories(); fetchProducts() }, [])
  useEffect(() => { fetchProducts() }, [page, limit])

  async function fetchCategories() {
    try {
      const r = await api.get('/admin/categories')
      setCategories(r.data || [])
    } catch (e) {
      console.error(e)
      setCategories([])
    }
  }

  async function fetchProducts() {
    try {
      const r = await api.get('/admin/products', { params: { q, page, limit } })
      const d = r.data || {}
      setProducts(d.data || [])
      setTotal(d.total || (d.data && d.data.length) || 0)
    } catch (e) {
      console.error(e)
      setProducts([])
      setTotal(0)
    }
  }

  function openEdit(p) {
    setEditing({ ...p })
  }

  function closeEdit() { setEditing(null) }

  async function saveEdit() {
    try {
      if (!editing || !editing.id) return
      const payload = { category_id: editing.category_id || null, subcategory_id: editing.subcategory_id || null }
      await api.put(`/admin/products/${editing.id}/category`, payload)
      fetchProducts()
      closeEdit()
    } catch (e) {
      console.error(e)
      import('../services/ui').then(m => m.showAlert(e?.response?.data?.error || 'Failed to save'))
    }
  }

  const filtered = products || []

  return (
    <div className="admin-users">
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <ListControls searchValue={q} onSearchChange={v => { setQ(v); setPage(1); }} onSearchEnter={fetchProducts} />
        </div>
        <div>
          <button className="btn" onClick={() => { setQ(''); setPage(1); fetchProducts() }}>Refresh</button>
        </div>
      </div>

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Subcategory</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, idx) => (
              <tr key={p.id}>
                <td>{((page || 1) - 1) * (limit || 20) + idx + 1}</td>
                <td>{p.sku}</td>
                <td>{p.name}</td>
                <td>{p.category || <em>—</em>}</td>
                <td>{p.subcategory || <em>—</em>}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn small" onClick={() => openEdit(p)}>Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationFooter total={total} page={page} pageSize={limit} onPageChange={p => setPage(p)} onPageSizeChange={s => { setLimit(s); setPage(1) }} />
      </div>

      {editing ? (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header"><h3>Assign Category for {editing.name}</h3></div>
            <div className="modal-grid">
              <div className="field">
                <div className="field-label">Category</div>
                <select value={editing.category_id || ''} onChange={e => { const v = e.target.value || null; setEditing(s => ({ ...s, category_id: v ? Number(v) : null, subcategory_id: null }))} }>
                  <option value="">— none —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <div className="field-label">Subcategory</div>
                <select value={editing.subcategory_id || ''} onChange={e => setEditing(s => ({ ...s, subcategory_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">— none —</option>
                  {(categories.find(c => Number(c.id) === Number(editing.category_id))?.subcategories || []).map(sc => (
                    <option key={sc.id} value={sc.id}>{sc.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={closeEdit}>Cancel</button>
              <button className="btn" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
