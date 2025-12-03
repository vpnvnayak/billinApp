import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import CreateDiscountModal from './CreateDiscountModal'

export default function Discounts() {
  const [discounts, setDiscounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  async function load() {
    try {
      setLoading(true)
      const r = await api.get('/marketing/discounts')
      setDiscounts(r.data || [])
    } catch (e) {
      console.error('Failed to load discounts', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ marginTop: 0 }}>Discounts</h3>
        <div>
          <button className="btn primary" onClick={() => setShowModal(true)}>Create Discount</button>
        </div>
      </div>
      <div style={{ color: 'var(--color-muted)', marginTop: 8 }}>Create and manage product-level discounts.</div>

      <div style={{ marginTop: 16 }}>
        {loading ? <div>Loading…</div> : null}
        {!loading && discounts.length === 0 ? <div style={{ color: 'var(--color-muted)' }}>No discounts yet. Click "Create Discount" to add one.</div> : null}
        <div style={{ marginTop: 12 }}>
          {discounts.map(d => (
            <div key={d.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{d.title}</strong>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{new Date(d.created_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={async () => { if (!confirm('Delete this discount?')) return; try { await api.delete(`/marketing/discounts/${d.id}`); load() } catch(e){ alert('Delete failed') } }}>Delete</button>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                {d.items && d.items.map(it => (
                  <div key={it.product_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed rgba(0,0,0,0.04)' }}>
                    <div>{it.name} <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>({it.sku})</span></div>
                    <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{it.offer && it.offer.type ? (it.offer.type === 'percent' ? `${it.offer.value}%` : it.offer.type === 'fixed' ? `₹${it.offer.value}` : it.offer.type === 'bogo' ? 'BOGO' : '') : '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal ? <CreateDiscountModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); load() }} /> : null}
    </div>
  )
}
