import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'

export default function Products() {
  const [products, setProducts] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [entries, setEntries] = useState(10)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchProducts()
  }, [])
  useEffect(() => { fetchProducts() }, [page, entries, query])
  async function fetchProducts() {
    setLoading(true)
    setError(null)
    try {
      const params = { page, limit: entries }
      if (query) params.q = query
      const r = await api.get('/products', { params })
      if (r.data && Array.isArray(r.data.data)) {
        setProducts(r.data.data)
        setTotal(r.data.total || 0)
      } else {
        setProducts(r.data || [])
        setTotal((r.data && r.data.length) || 0)
      }
    } catch (err) {
      setError('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const filtered = (() => {
    const q = (query || '').trim().toLowerCase()
    let res = products
    if (q) res = products.filter(p => String(p.sku).toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
    const start = ((page || 1) - 1) * (entries || 10)
    return res.slice(start, start + (entries || 10))
  })()

  return (
    <div className="products-page">
      <div className="page-header products-header">
        <div className="search">
          <MagnifyingGlassIcon style={{ width: 18, height: 18 }} aria-hidden />
          <input placeholder="Search SKU or name" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="page-header-actions">
          <button className="btn small" onClick={() => setShowCreate(true)}>
            <PlusIcon style={{ width: 14, height: 14, marginRight: 8 }} aria-hidden /> Add product
          </button>
        </div>
      </div>

  <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Products</div>
          <div className="kpi-value">{products.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Stock Value</div>
          <div className="kpi-value">{(() => {
            const total = (products || []).reduce((s, p) => s + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0)
            return `₹ ${Number(total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          })()}</div>
          <div className="kpi-meta">inventory value</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Average Price</div>
          <div className="kpi-value">{(() => {
            const total = (products || []).reduce((s, p) => s + (Number(p.price) || 0), 0)
            const avg = products.length ? total / products.length : 0
            return `₹ ${Number(avg).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
          })()}</div>
          <div className="kpi-meta">per product</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">New Products</div>
          <div className="kpi-value">{(() => {
            try {
              const now = Date.now()
              const days30 = 1000 * 60 * 60 * 24 * 30
              const count = (products || []).filter(it => it.created_at && (now - new Date(it.created_at).getTime()) <= days30).length
              return count
            } catch (e) { return 0 }
          })()}</div>
          <div className="kpi-meta">last 30 days</div>
        </div>
      </div>

      {loading && <div className="app-loader"><div><div className="loader" aria-hidden></div><div className="loader-text">Loading products…</div></div></div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <div className="card">
          <div style={{ padding: '12px 16px' }}>
            <ListControls searchValue={query} onSearchChange={v => { setQuery(v); setPage(1) }} />
          </div>
          <div className="table-wrap">
            <table className="products-table">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Name</th>
                <th>MRP</th>
                <th>Selling Price</th>
                <th>Tax %</th>
                <th>Stock</th>
                <th>Unit</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9}>No products found</td></tr>
              )}
              {filtered.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.mrp ?? ''}</td>
                  <td>{p.price ?? ''}</td>
                  <td>{p.tax_percent != null ? `${p.tax_percent}%` : ''}</td>
                  <td>{p.stock ?? 0}</td>
                  <td>{p.unit ?? ''}</td>
                  <td><button className="btn small" onClick={() => setEditing(p)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 16px' }}>
            <PaginationFooter total={total} page={page} pageSize={entries} onPageChange={p => setPage(p)} onPageSizeChange={s => { setEntries(s); setPage(1) }} />
          </div>
        </div>
      )}

      {/* Create product modal */}
      {showCreate && (
        <ProductModal onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await fetchProducts() }} />
      )}

      {/* Edit product modal */}
      {editing && (
        <ProductModal product={editing} onClose={() => setEditing(null)} onCreated={async () => { setEditing(null); await fetchProducts() }} />
      )}
    </div>
  )
}

function ProductModal({ onClose, onCreated, product }) {
  const [name, setName] = useState(product?.name || '')
  const [sku, setSku] = useState(product?.sku || '')
  const [mrp, setMrp] = useState(product?.mrp ?? '')
  const [price, setPrice] = useState(product?.price ?? '')
  const [unit, setUnit] = useState(product?.unit || 'KG')
  const [taxPercent, setTaxPercent] = useState(product?.tax_percent ?? 0)
  const [stock, setStock] = useState(product?.stock ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    setError(null)
    if (!name) return setError('Name is required')
    setSaving(true)
    try {
      if (product && product.id) {
        await api.put(`/products/${product.id}`, { name, sku, mrp: mrp || null, price: price || null, unit, tax_percent: taxPercent, stock })
      } else {
        await api.post('/products', { name, sku, mrp: mrp || null, price: price || null, unit, tax_percent: taxPercent, stock })
      }
      if (onCreated) await onCreated()
    } catch (err) {
      setError(product ? 'Failed to update product' : 'Failed to create product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
  <h3>{product ? 'Edit product' : 'Create product'}</h3>
        {error && <div className="error">{error}</div>}
  <label className="field"><span className="field-label">Name</span><input type="text" value={name} onChange={e => setName(e.target.value)} /></label>
  <label className="field"><span className="field-label">Barcode / SKU</span><input type="text" value={sku} onChange={e => setSku(e.target.value)} /></label>

        <div className="row">
          <div className="col">
            <label className="field"><span className="field-label">MRP</span><input value={mrp} onChange={e => setMrp(e.target.value)} type="number" step="0.01" /></label>
          </div>
          <div className="col">
            <label className="field"><span className="field-label">Selling price</span><input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.01" /></label>
          </div>
        </div>

        <div className="row">
          <div className="col">
            <label className="field"><span className="field-label">Unit</span>
              <select value={unit} onChange={e => setUnit(e.target.value)}>
                <option>KG</option>
                <option>G</option>
                <option>Nos</option>
                <option>L</option>
                <option>ML</option>
              </select>
            </label>
          </div>
          <div className="col">
            <label className="field"><span className="field-label">Tax %</span>
              <select value={taxPercent} onChange={e => setTaxPercent(Number(e.target.value))}>
                <option value={0}>0%</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
                <option value={40}>40%</option>
              </select>
            </label>
          </div>
        </div>

        <label className="field"><span className="field-label">Stock</span><input value={stock} onChange={e => setStock(Number(e.target.value))} type="number" min="0" /></label>

        <div className="actions">
          <button className="btn cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : (product ? 'Save' : 'Create')}</button>
        </div>
      </div>
    </div>
  )
}
