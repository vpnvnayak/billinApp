import React, { useEffect, useRef, useState } from 'react'
import api from '../../services/api'

export default function CreatePosterModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [products, setProducts] = useState([])
  const [selected, setSelected] = useState([]) // { product, offer }
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [suggestLoading, setSuggestLoading] = useState(false)

  const tpl1Ref = useRef()
  const tpl2Ref = useRef()
  const tpl3Ref = useRef()

  useEffect(() => {
    // initial small product fetch for fallback / autocomplete seed
    api.get('/products?limit=50').then(r => {
      const payload = r && r.data
      if (!payload) return setProducts([])
      if (Array.isArray(payload)) return setProducts(payload)
      if (Array.isArray(payload.data)) return setProducts(payload.data)
      return setProducts([])
    }).catch(() => {})
  }, [])

  // suggestion fetch (debounced)
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

  // Try to find external images for products that lack images.
  // Strategy: 1) OpenFoodFacts by barcode (sku) if it looks numeric, 2) Wikimedia Commons search by product name.
  async function fetchImageFromOpenFoodFacts(barcode) {
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`)
      if (!res.ok) return null
      const j = await res.json()
      if (j && j.status === 1 && j.product && j.product.image_front_url) return j.product.image_front_url
      return null
    } catch (e) { return null }
  }

  async function fetchImageFromWikimedia(name) {
    try {
      const q = encodeURIComponent(name)
      const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=original&generator=search&gsrsearch=${q}&gsrlimit=5`
      const res = await fetch(url)
      if (!res.ok) return null
      const j = await res.json()
      if (j && j.query && j.query.pages) {
        const pages = Object.values(j.query.pages)
        for (const p of pages) {
          if (p && p.original && p.original.source) return p.original.source
        }
      }
      return null
    } catch (e) { return null }
  }

  async function ensureProductImagesForSelected() {
    const updated = await Promise.all(selected.map(async s => {
      const prod = { ...s.product }
      if (prod.image || prod.image_url || (prod.images && prod.images.length)) return s
      // try OpenFoodFacts if SKU looks like a barcode
      let img = null
      const sku = (prod.sku || '').toString().trim()
      if (sku && /^\d{6,}$/.test(sku)) {
        img = await fetchImageFromOpenFoodFacts(sku)
      }
      if (!img) {
        img = await fetchImageFromWikimedia(prod.name || sku || '')
      }
      if (img) prod.image = img
      return { ...s, product: prod }
    }))
    setSelected(updated)
    return updated
  }

  async function generateAndUpload() {
    if (!title.trim()) return alert('Enter title')
    if (selected.length === 0) return alert('Select at least one product')
    setLoading(true)
    try {
      // attempt to fetch missing product images before generating templates
      await ensureProductImagesForSelected()
      // lazy-load html2canvas to avoid bundler pre-transform issues
      const { default: html2canvas } = await import('html2canvas')
      const elList = [tpl1Ref.current, tpl2Ref.current, tpl3Ref.current]
      const templates = []
      // helper: wait for images inside an element to finish loading
      const waitForImagesInElement = async (el) => {
        if (!el) return
        const imgs = Array.from(el.querySelectorAll('img'))
        await Promise.all(imgs.map(img => new Promise(resolve => {
          if (img.complete) return resolve()
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })))
      }
      for (let i = 0; i < elList.length; i++) {
        const el = elList[i]
        if (!el) continue
        // wait for images inside the template to load (fetched from web)
        try { await waitForImagesInElement(el) } catch (e) {}
        // small delay to let layout settle
        await new Promise(r => setTimeout(r, 120))
        const scale = Math.max(1, window.devicePixelRatio || 2)
        const canvas = await html2canvas(el, { useCORS: true, scale })
        const data = canvas.toDataURL('image/png')
        templates.push({ name: `template${i+1}`, data })
      }

      const items = selected.map(s => ({ product_id: s.product.id, name: s.product.name, sku: s.product.sku, price: s.product.selling_price || s.product.price || 0, offer: s.offer }))

      await api.post('/marketing/posters', { title: title.trim(), subtitle: subtitle.trim(), items, templates })
      if (onCreated) onCreated()
    } catch (e) {
      console.error('poster create failed', e)
      alert('Failed to create poster')
    } finally {
      setLoading(false)
    }
  }

  // Simple template renderers
  const TemplateCard = ({ width = 360, height = 480, children, style }) => (
    <div style={{ width, height, background: 'white', borderRadius: 6, padding: 12, boxSizing: 'border-box', ...style }}>
      {children}
    </div>
  )

  return (
    <div className="modal-overlay">
      <div className="modal large-modal posters-modal">
        <div className="modal-header">
          <h3>Create Poster</h3>
          <button className="btn btn-ghost" onClick={() => onClose && onClose()}>Close</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ flex: 1, width: '100%' }}>
            <div className="field"><label className="field-label">Title</label><input value={title} onChange={e => setTitle(e.target.value)} /></div>
            <div className="field"><label className="field-label">Subtitle</label><input value={subtitle} onChange={e => setSubtitle(e.target.value)} style={{ width: '100%' }} /></div>

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
                      <option value="none">No Offer</option>
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
              <button className="btn primary" onClick={generateAndUpload} disabled={loading}>{loading ? 'Creating…' : 'Create'}</button>
              <button className="btn btn-ghost" onClick={() => onClose && onClose()} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          </div>
        </div>
        
        {/* Hidden template containers used only for html2canvas capture (off-screen) */}
        <div style={{ position: 'absolute', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden>
          <div ref={tpl1Ref}>
            <TemplateCard style={{ width: 800, height: 1100 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {selected[0] && (selected[0].product.image || selected[0].product.image_url || (selected[0].product.images && selected[0].product.images[0])) ? (
                  <img src={selected[0].product.image || selected[0].product.image_url || (selected[0].product.images && selected[0].product.images[0])} alt={selected[0].product.name} style={{ width: 220, height: 220, objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <div style={{ width: 220, height: 220, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: '#9ca3af' }}>No image</div>
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 36, fontWeight: 700 }}>{title || 'Title'}</div>
                  <div style={{ fontSize: 20, color: 'var(--color-muted)' }}>{subtitle || 'Subtitle'}</div>
                  <div style={{ marginTop: 24 }}>
                    {selected[0] ? (
                      <div>
                        <div style={{ fontSize: 28 }}>{selected[0].product.name}</div>
                        <div style={{ marginTop: 12, display: 'inline-block', background: '#ff4d4f', color: '#fff', padding: '8px 12px', borderRadius: 6 }}>{selected[0].offer.type === 'percent' ? `${selected[0].offer.value}% OFF` : selected[0].offer.type === 'fixed' ? `₹${selected[0].offer.value} OFF` : selected[0].offer.type === 'bogo' ? 'BOGO' : ''}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </TemplateCard>
          </div>

          <div ref={tpl2Ref}>
            <TemplateCard style={{ width: 800, height: 800 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>Offers</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                {selected.slice(0, 8).map(s => (
                  <div key={s.product.id} style={{ padding: 12, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {(s.product.image || s.product.image_url || (s.product.images && s.product.images[0])) ? (
                      <img src={s.product.image || s.product.image_url || (s.product.images && s.product.images[0])} alt={s.product.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
                    ) : (
                      <div style={{ width: 64, height: 64, background: '#f3f4f6', borderRadius: 6 }} />
                    )}
                    <div>
                      <div style={{ fontSize: 18 }}>{s.product.name}</div>
                      <div style={{ fontSize: 16, color: 'var(--color-muted)' }}>{s.offer.type === 'percent' ? `${s.offer.value}%` : s.offer.type === 'fixed' ? `₹${s.offer.value}` : s.offer.type === 'bogo' ? 'BOGO' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </TemplateCard>
          </div>

          <div ref={tpl3Ref}>
            <TemplateCard style={{ width: 800, height: 600 }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{title || 'Title'}</div>
              <div style={{ marginTop: 12 }}>
                {selected.map(s => (
                  <div key={s.product.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed rgba(0,0,0,0.04)', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      {(s.product.image || s.product.image_url || (s.product.images && s.product.images[0])) ? (
                        <img src={s.product.image || s.product.image_url || (s.product.images && s.product.images[0])} alt={s.product.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                      ) : (
                        <div style={{ width: 56, height: 56, background: '#f3f4f6', borderRadius: 6 }} />
                      )}
                      <div style={{ fontSize: 16 }}>{s.product.name}</div>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--color-muted)' }}>{s.offer.type === 'percent' ? `${s.offer.value}%` : s.offer.type === 'fixed' ? `₹${s.offer.value}` : s.offer.type === 'bogo' ? 'BOGO' : ''}</div>
                  </div>
                ))}
              </div>
            </TemplateCard>
          </div>
        </div>

      </div>
    </div>
  )
}
