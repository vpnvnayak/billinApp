import React, { useEffect, useState } from 'react'
import api from '../../services/api'

export default function CreateDiscountModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [selected, setSelected] = useState([]) // { product, offer }
  const [loading, setLoading] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')

  useEffect(() => {
    if (!query || query.length < 2) { setSuggestions([]); return }
    let mounted = true
    setSuggestLoading(true)
    const t = setTimeout(() => {
      api.get(`/products?q=${encodeURIComponent(query)}&limit=10`).then(r => {
        if (!mounted) return
        const payload = r && r.data
        let list = []
        if (Array.isArray(payload)) list = payload
        else if (Array.isArray(payload.data)) list = payload.data
        setSuggestions(list)
      }).catch(() => setSuggestions([])).finally(() => setSuggestLoading(false))
    }, 250)
    return () => { mounted = false; clearTimeout(t) }
  }, [query])

  function toggleProduct(p) {
    const exists = selected.find(s => s.product.id === p.id)
    if (exists) setSelected(prev => prev.filter(s => s.product.id !== p.id))
    else setSelected(prev => [...prev, { product: p, offer: { type: 'none', value: 0 } }])
  }

  function updateOffer(productId, newOffer) {
    setSelected(prev => prev.map(s => s.product.id === productId ? { ...s, offer: { ...s.offer, ...newOffer } } : s))
  }

  async function save() {
    if (!title.trim()) return alert('Enter discount title')
    if (selected.length === 0) return alert('Select at least one product')
    setLoading(true)
    try {
      const items = selected.map(s => ({ product_id: s.product.id, name: s.product.name, sku: s.product.sku, price: s.product.selling_price || s.product.price || 0, offer: s.offer }))
      const payload = { title: title.trim(), items, meta: expiryDate ? { expiry_date: expiryDate } : null }
      await api.post('/marketing/discounts', payload)
      if (onCreated) onCreated()
    } catch (e) {
      console.error('save discount failed', e)
      alert('Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Create Discount</h3>
          <button className="btn btn-ghost" onClick={() => onClose && onClose()}>Close</button>
        </div>

          <div style={{ padding: 12 }}>
          <div className="field"><label className="field-label">Title</label><input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%' }} /></div>

          <div style={{ marginTop: 8 }} className="field"><label className="field-label">Expiry date (optional)</label>
            <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div style={{ marginTop: 8 }}><strong>Search products (name or SKU)</strong></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input placeholder="Search product name or SKU" value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 1 }} />
            <button className="btn" onClick={() => { setQuery(''); setSuggestions([]) }}>Clear</button>
          </div>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--color-surface-2)', padding: 8, borderRadius: 6, marginTop: 8 }}>
            {suggestLoading ? <div style={{ color: 'var(--color-muted)' }}>Searching…</div> : null}
            {!suggestLoading && suggestions.length === 0 && query.length >= 2 ? <div style={{ color: 'var(--color-muted)' }}>No matches</div> : null}
            {!suggestLoading && suggestions.map(p => {
              const exists = selected.find(s => s.product.id === p.id)
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <div>
                    <div style={{ fontSize: 14 }}>{p.name} <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>({p.sku})</span></div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>₹{p.selling_price || p.price || 0}</div>
                  </div>
                  <div>
                    {exists ? <button className="btn" onClick={() => toggleProduct(p)}>Remove</button> : <button className="btn primary" onClick={() => { toggleProduct(p); setQuery(''); setSuggestions([]) }}>Add</button>}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 12 }}><strong>Selected products</strong></div>
          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--color-surface-2)', padding: 8, borderRadius: 6, marginTop: 8, width: '100%' }}>
            {selected.length === 0 ? <div style={{ color: 'var(--color-muted)' }}>No products selected</div> : null}
            {selected.map(s => (
              <div key={s.product.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <div style={{ maxWidth: '60%', overflow: 'hidden', wordBreak: 'break-word' }}>
                  <div style={{ fontSize: 14 }}>{s.product.name} <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>({s.product.sku})</span></div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>₹{s.product.selling_price || s.product.price || 0}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={s.offer.type} onChange={e => updateOffer(s.product.id, { type: e.target.value })}>
                    <option value="bogo">BOGO</option>
                    <option value="percent">% OFF</option>
                    <option value="fixed">Rs Off</option>
                  </select>
                  {s.offer.type === 'percent' || s.offer.type === 'fixed' ? (
                    <input type="number" value={s.offer.value || 0} onChange={e => updateOffer(s.product.id, { value: Number(e.target.value) })} style={{ width: 80 }} />
                  ) : null}
                  <button className="btn" onClick={() => toggleProduct(s.product)}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={save} disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
            <button className="btn btn-ghost" onClick={() => onClose && onClose()} style={{ marginLeft: 8 }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
