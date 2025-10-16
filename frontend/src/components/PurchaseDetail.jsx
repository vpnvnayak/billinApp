import React, { useEffect, useState, useRef } from 'react'
import api from '../services/api'
import * as ui from '../services/ui'

export default function PurchaseDetail({ id }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [purchase, setPurchase] = useState(null)
  const [items, setItems] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [supplierSearch, setSupplierSearch] = useState('')
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [productSuggestionsVisible, setProductSuggestionsVisible] = useState(false)
  const [productHighlightedIndex, setProductHighlightedIndex] = useState(-1)
  const [productSuggestions, setProductSuggestions] = useState([])
  const productTimer = useRef()
  const ignoreNextProductFetch = useRef(false)

  function getEmptyNewItem() {
    return {
      product_id: '', sku: '', name: '', qty: 1, gross: 0, est_rate: 0, sp_rate: 0,
      discount_mode: 'pct', discount_pct: 0, discount_rs: 0,
      expiry: '', tax_pct: 0, sales_tax_pct: 0, cess_pct: 0, batch: '', mrp: 0, mrp_profit_pct: 0,
      retail_price: 0, retail_profit_pct: 0, wholesale_price: 0, wholesale_profit_pct: 0, special_price: 0, sp_profit_pct: 0
    }
  }

  const [newItem, setNewItem] = useState(getEmptyNewItem())
  const productSelectRef = useRef(null)
  const [editingIndex, setEditingIndex] = useState(-1)

  // Recompute profit percentages live when newItem relevant fields change
  useEffect(() => {
    try {
      const qty = Number(newItem.qty) || 0
      const gross = Number(newItem.gross) || 0
      const est_rate = Number(newItem.est_rate) || 0
      const sp_rate = Number(newItem.sp_rate) || 0
      const unit = est_rate || sp_rate || (qty ? Number((gross / qty).toFixed(2)) : 0)

      let discountAmount = 0
      if ((newItem.discount_mode || 'pct') === 'pct') {
        const dp = Number(newItem.discount_pct) || 0
        discountAmount = gross * (dp / 100)
      } else {
        discountAmount = Number(newItem.discount_rs) || 0
      }

      const taxPct = (Number(newItem.tax_pct) || 0) + (Number(newItem.sales_tax_pct) || 0) + (Number(newItem.cess_pct) || 0)
      const taxAmount = (gross * taxPct) / 100
      const costLine = gross + taxAmount - discountAmount
      const costPerUnit = qty > 0 ? Number((costLine / qty).toFixed(2)) : Number(unit.toFixed(2))

      const mrp = Number(newItem.mrp) || 0
      const retail = Number(newItem.retail_price) || 0
      const wholesale = Number(newItem.wholesale_price) || 0
      const sp = Number(newItem.special_price) || 0

      const mrp_profit_pct = mrp ? Number((((mrp - costPerUnit) / mrp) * 100).toFixed(2)) : 0
      const retail_profit_pct = retail ? Number((((retail - costPerUnit) / retail) * 100).toFixed(2)) : 0
      const wholesale_profit_pct = wholesale ? Number((((wholesale - costPerUnit) / wholesale) * 100).toFixed(2)) : 0
      const sp_profit_pct = sp ? Number((((sp - costPerUnit) / sp) * 100).toFixed(2)) : 0

      // Only update if values differ to avoid re-render loops
      if (newItem.mrp_profit_pct !== mrp_profit_pct || newItem.retail_profit_pct !== retail_profit_pct || newItem.wholesale_profit_pct !== wholesale_profit_pct || newItem.sp_profit_pct !== sp_profit_pct) {
        setNewItem(n => ({ ...n, mrp_profit_pct, retail_profit_pct, wholesale_profit_pct, sp_profit_pct }))
      }
    } catch (e) { console.error('Profit recalc failed', e) }
  }, [newItem.qty, newItem.gross, newItem.est_rate, newItem.sp_rate, newItem.discount_mode, newItem.discount_pct, newItem.discount_rs, newItem.tax_pct, newItem.sales_tax_pct, newItem.cess_pct, newItem.mrp, newItem.retail_price, newItem.wholesale_price, newItem.special_price])

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        if (id === 'new') {
          const p = { id: null, supplier_id: null, supplier_name: '', metadata: {}, created_at: new Date().toISOString() }
          setPurchase(p)
          setItems([])
        } else {
          const r = await api.get(`/purchases/${id}`)
          const p = r.data.purchase || r.data
          const its = r.data.items || []
          setPurchase(p)
          setItems(its.map(it => ({ ...it })))
        }

        try {
          const rs = await api.get('/suppliers')
          const sdata = (rs && rs.data) || []
          setSuppliers(Array.isArray(sdata) ? sdata : (sdata.data || []))
        } catch (e) { console.error('Failed to load suppliers', e); setSuppliers([]) }

        try {
          const rp = await api.get('/products')
          const pdata = (rp && rp.data) || []
          setProducts(Array.isArray(pdata) ? pdata : (pdata.data || []))
        } catch (e) { console.error('Failed to load products', e); setProducts([]) }

      } catch (e) { console.error('Failed to load purchase', e); setPurchase(null); setItems([]) } finally { setLoading(false) }
    }
    load()
  }, [id])

  useEffect(() => {
    setTimeout(() => { try { productSelectRef.current && productSelectRef.current.focus() } catch (e) {} }, 120)
  }, [products])

  // Debounced server-side product suggestions when user types 3+ chars
  useEffect(() => {
    const q = (productSearch || '').trim()
    clearTimeout(productTimer.current)
    if (q.length >= 3) {
      // If we programmatically set the productSearch right after a selection,
      // avoid immediately fetching again and re-opening suggestions.
      if (ignoreNextProductFetch.current) {
        ignoreNextProductFetch.current = false
        setProductSuggestions([])
        setProductSuggestionsVisible(false)
      } else {
        productTimer.current = setTimeout(async () => {
          try {
            const r = await api.get('/products', { params: { query: q, limit: 20 } })
            const data = (r && r.data) || []
            setProductSuggestions(Array.isArray(data) ? data : (data.data || []))
            setProductSuggestionsVisible(true)
            setProductHighlightedIndex(-1)
          } catch (e) {
            console.error('Product search failed', e)
            setProductSuggestions([])
            setProductSuggestionsVisible(false)
          }
        }, 250)
      }
    } else {
      setProductSuggestions([])
      setProductSuggestionsVisible(false)
    }
    return () => clearTimeout(productTimer.current)
  }, [productSearch])

  function updateItem(idx, patch) {
    setItems(it => it.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function addEmptyItem() {
    setItems(it => [...it, { product_id: null, sku: '', name: '', qty: 1, price: 0, line_total: 0 }])
  }

  function removeItem(idx) {
    setItems(it => it.filter((_, i) => i !== idx))
  }

  function selectSupplier(s) {
    if (!s) return
    setPurchase(p => ({ ...p, supplier_id: s.id, supplier_name: s.name, metadata: { ...p.metadata, supplier_name: s.name } }))
    setSupplierSearch(s.name)
    setSuggestionsVisible(false)
    setHighlightedIndex(-1)
  }

  function computeTotals(itms) {
    const subtotal = (itms || []).reduce((s, x) => s + (Number(x.total_amount || x.line_total) || 0), 0)
    return { subtotal, total: subtotal }
  }

  function addItem() {
    if (!newItem.product_id && !newItem.name) return ui.showAlert('Select a product or enter name')
    const qty = Number(newItem.qty) || 0
    if (qty <= 0) return ui.showAlert('Quantity must be greater than zero')
    const unit = Number(newItem.est_rate) || Number(newItem.sp_rate) || (newItem.gross ? Number(newItem.gross) / Math.max(1, qty) : 0)
    const grossLine = unit * qty
    let discountAmount = 0, discountPct = 0, discountRs = 0
    if ((newItem.discount_mode || 'pct') === 'pct') {
      discountPct = Number(newItem.discount_pct) || 0
      discountAmount = grossLine * (discountPct / 100)
      discountRs = Number((discountAmount).toFixed(2))
    } else {
      discountRs = Number(newItem.discount_rs) || 0
      discountAmount = discountRs
      discountPct = grossLine > 0 ? Number(((discountRs / grossLine) * 100).toFixed(2)) : 0
    }
  // cost price calculation per user request:
  // cost = (gross amount + tax% of gross amount) - net discount
  const taxPct = (Number(newItem.tax_pct) || 0) + (Number(newItem.sales_tax_pct) || 0) + (Number(newItem.cess_pct) || 0)
  const afterDiscount = Number((grossLine - discountAmount).toFixed(2))
  const taxAmount = Number(((grossLine * taxPct) / 100).toFixed(2))
  const totalAmount = Number((afterDiscount + taxAmount).toFixed(2))
  const line_total = afterDiscount
  const costLine = grossLine + taxAmount - discountAmount
  const costPerUnit = qty > 0 ? Number((costLine / qty).toFixed(2)) : 0

  const mrp = Number(newItem.mrp) || 0
  const mrp_profit = Number((mrp - costPerUnit).toFixed(2))
  const mrp_profit_pct = mrp ? Number(((mrp_profit / mrp) * 100).toFixed(2)) : 0
  const retail = Number(newItem.retail_price) || 0
  const retail_profit = Number((retail - costPerUnit).toFixed(2))
  const retail_profit_pct = retail ? Number(((retail_profit / retail) * 100).toFixed(2)) : 0
  const wholesale = Number(newItem.wholesale_price) || 0
  const wholesale_profit = Number((wholesale - costPerUnit).toFixed(2))
  const wholesale_profit_pct = wholesale ? Number(((wholesale_profit / wholesale) * 100).toFixed(2)) : 0
  const sp = Number(newItem.special_price) || 0
  const sp_profit = Number((sp - costPerUnit).toFixed(2))
  const sp_profit_pct = sp ? Number(((sp_profit / sp) * 100).toFixed(2)) : 0

    const item = {
      ...newItem,
      unit_price: unit,
      qty,
      gross_amount: Number(grossLine.toFixed(2)),
      after_discount: afterDiscount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      line_total,
      discount_rs: discountRs,
      discount_pct: discountPct,
      discount_mode: newItem.discount_mode || 'pct',
      mrp_profit,
      mrp_profit_pct,
      retail_profit,
      retail_profit_pct,
      wholesale_profit,
      wholesale_profit_pct,
      sp_profit,
      sp_profit_pct
    }
    if (editingIndex >= 0) {
      // update existing item
      setItems(it => it.map((r, i) => i === editingIndex ? { ...item } : r))
      setEditingIndex(-1)
    } else {
      setItems(it => [...(it || []), item])
    }
    setNewItem(getEmptyNewItem())
    setTimeout(() => { try { productSelectRef.current && productSelectRef.current.focus() } catch (e) {} }, 80)
  }

  async function save() {
    if (!purchase) return
    if (!purchase.supplier_id && !(purchase.metadata && purchase.metadata.supplier_name)) return ui.showAlert('Supplier is required')
    if ((items || []).length === 0) return ui.showAlert('Add at least one item')
    try {
      setSaving(true)
      const payload = { supplier_id: purchase.supplier_id || null, total_amount: computeTotals(items).total, metadata: purchase.metadata || {}, items }
      if (id === 'new') {
        const r = await api.post('/purchases', payload)
        ui.showSnackbar('Purchase created', 'success')
        const created = r.data
        const newId = created && created.id
        if (newId && typeof window !== 'undefined' && window.__appNavigate) {
          window.__appNavigate(`/purchases/${newId}`)
        } else if (newId) {
          try { window.history.pushState(null, '', `/purchases/${newId}`) } catch (e) {}
          window.location.reload()
        }
      } else {
        const r = await api.put(`/purchases/${id}`, payload)
        ui.showSnackbar('Purchase saved', 'success')
        const rr = await api.get(`/purchases/${id}`)
        const p = rr.data.purchase || rr.data
        const its = rr.data.items || []
        setPurchase(p)
        setItems(its.map(it => ({ ...it })))
      }
    } catch (e) { console.error(e); ui.showAlert('Failed to save') } finally { setSaving(false) }
  }

  if (loading) return <div className="card">Loading...</div>
  if (!purchase) return <div className="card">Purchase not found</div>

  const totals = computeTotals(items)
  const discount = Number(purchase.metadata && Number(purchase.metadata.discount) || 0)
  const round_off = Number(purchase.metadata && Number(purchase.metadata.round_off) || 0)
  const expense = Number(purchase.metadata && Number(purchase.metadata.expense) || 0)
  const paid = Number(purchase.metadata && Number(purchase.metadata.paid) || 0)
  // If metadata contains an explicit bill_amount use that (user override),
  // otherwise compute from totals and adjustments.
  const computedBill = Number((totals.total - discount + round_off + expense) || 0)
  const billAmount = Number(purchase.metadata && Number(purchase.metadata.bill_amount) ? Number(purchase.metadata.bill_amount) : computedBill)
  const balance = Number((billAmount - paid) || 0)

  // Validate: total + expense - discount - round_off should equal bill amount
  // Allow a small tolerance for rounding (0.5 paise). If mismatched, highlight
  // the Total field so the user can see an inconsistency.
  const computedCheck = Number((totals.total + expense - discount - round_off) || 0)
  const mismatch = Math.abs(computedCheck - billAmount) > 0.01


  return (
    <div className="page purchases-page">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Purchase #{purchase.id}</h3>
          <div>{purchase.created_at ? new Date(purchase.created_at).toLocaleString() : ''}</div>
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="field-label" style={{ margin: 0 }}>Upload Invoice</label>
          <input type="file" accept=".pdf,image/*" onChange={async (e) => {
            const f = e.target.files && e.target.files[0]
            if (!f) return
            try {
              ui.showSnackbar('Parsing invoice...', 'info')
              const fd = new FormData()
              fd.append('file', f)
              // backend router is mounted at /api/purchases/parse -> parse-invoice
              const r = await api.post('/purchases/parse/parse-invoice', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
              const parsed = r.data && r.data.parsed
              if (!parsed) return ui.showAlert('Could not parse invoice')
              // populate supplier
              if (parsed.supplier_name) setPurchase(p => ({ ...p, supplier_name: parsed.supplier_name, metadata: { ...p.metadata, supplier_name: parsed.supplier_name } }))
              if (parsed.invoice_no) setPurchase(p => ({ ...p, metadata: { ...p.metadata, purchase_no: parsed.invoice_no } }))
              if (parsed.invoice_date) setPurchase(p => ({ ...p, created_at: parsed.invoice_date }))
              // lines -> items
              if (Array.isArray(parsed.lines) && parsed.lines.length) {
                const newItems = parsed.lines.map(l => ({ sku: l.sku || '', name: l.name || '', qty: l.qty || 1, gross_amount: l.line_total || l.rate ? (Number(l.rate||0) * Number(l.qty||1)) : (l.line_total || 0), unit_price: l.rate || 0, line_total: l.line_total || 0, total_amount: l.line_total || 0 }))
                setItems(newItems)
              }
              if (parsed.total) setPurchase(p => ({ ...p, metadata: { ...p.metadata, bill_amount: parsed.total } }))
              ui.showSnackbar('Invoice parsed. Please verify fields before saving.', 'success')
            } catch (err) { console.error('parse failed', err); const detail = err && err.response && (err.response.data && (err.response.data.detail || err.response.data.error)) ? (err.response.data.detail || err.response.data.error) : err.message || 'Invoice parse failed'; ui.showAlert(`Invoice parse failed: ${detail}`) }
          }} />
        </div>

        <div className="modal-grid" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="field-label">Invoice Number</label>
            <input value={purchase.metadata?.purchase_no || purchase.invoice_no || ''} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, purchase_no: e.target.value } }))} />
          </div>
          <div className="field" style={{ position: 'relative' }}>
            <label className="field-label">Supplier</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  placeholder="Search suppliers..."
                  value={supplierSearch}
                  onChange={e => { setSupplierSearch(e.target.value); setSuggestionsVisible(true); setHighlightedIndex(-1) }}
                  onFocus={() => setSuggestionsVisible(true)}
                  onBlur={() => setTimeout(() => setSuggestionsVisible(false), 150)}
                  onKeyDown={e => {
                    const filtered = (suppliers || []).filter(s => !supplierSearch || (s.name || '').toLowerCase().includes(supplierSearch.toLowerCase()))
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setHighlightedIndex(i => Math.min((filtered.length - 1), i + 1))
                      setSuggestionsVisible(true)
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setHighlightedIndex(i => Math.max(-1, i - 1))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
                        const sel = filtered[highlightedIndex]
                        if (sel) selectSupplier(sel)
                      }
                    }
                  }}
                />
                {suggestionsVisible && (suppliers || []).filter(s => !supplierSearch || (s.name || '').toLowerCase().includes(supplierSearch.toLowerCase())).length > 0 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 40, background: 'white', border: '1px solid var(--color-border)', maxHeight: 220, overflow: 'auto', marginTop: 6 }}>
                    {(suppliers || []).filter(s => !supplierSearch || (s.name || '').toLowerCase().includes(supplierSearch.toLowerCase())).map((s, idx) => (
                      <div
                        key={s.id}
                        onMouseDown={() => selectSupplier(s)}
                        style={{ padding: '8px 10px', cursor: 'pointer', background: highlightedIndex === idx ? 'var(--color-surface-2)' : 'transparent' }}
                      >
                        {s.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn success" onClick={() => { if (window.__appNavigate) window.__appNavigate('/suppliers'); else window.location.href = '/suppliers' }}>New!</button>
            </div>
          </div>
          <div className="field">
            <label className="field-label">Invoice Date</label>
            <input type="date" value={purchase.created_at ? new Date(purchase.created_at).toISOString().slice(0,10) : ''} onChange={e => setPurchase(p => ({ ...p, created_at: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Arrival Date</label>
            <input type="date" value={(purchase.metadata && purchase.metadata.arrival_date) ? new Date(purchase.metadata.arrival_date).toISOString().slice(0,10) : ''} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, arrival_date: e.target.value } }))} />
          </div>
          <div className="field">
            <label className="field-label">GST Type</label>
            <select value={(purchase.metadata && purchase.metadata.gst_type) || 'GST'} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, gst_type: e.target.value } }))}>
              <option value="GST">GST</option>
              <option value="Non-GST">Non-GST</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'block' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4>Items</h4>
          </div>

          <div className="item-entry-grid" style={editingIndex >= 0 ? { background: 'rgba(255,249,230,0.9)', padding: 12, borderRadius: 8 } : undefined}>
            <div style={{ position: 'relative' }}>
              <label className="field-label">Item Name [F1]</label>
              <input
                ref={productSelectRef}
                placeholder="Search product..."
                value={productSearch || newItem.name || ''}
                onChange={e => { const v = e.target.value || ''; if ((v||'').trim() === '') { setProductSearch(''); setNewItem(n => ({ ...n, product_id: '', sku: '', name: '' })); setProductSuggestionsVisible(false); setProductHighlightedIndex(-1); } else { setProductSearch(v); setProductSuggestionsVisible((v||'').trim().length >= 3); setProductHighlightedIndex(-1) } }}
                onFocus={() => { if ((productSearch||'').trim().length >= 3) setProductSuggestionsVisible(true) }}
                onBlur={() => setTimeout(() => setProductSuggestionsVisible(false), 180)}
                onKeyDown={e => {
                  const q = (productSearch || '').trim()
                  const filtered = (q.length >= 3) ? (products || []).filter(p => (p.name || '').toLowerCase().includes(q.toLowerCase()) || (p.sku || '').toLowerCase().includes(q.toLowerCase())) : []
                  if (e.key === 'ArrowDown') { e.preventDefault(); if (filtered.length > 0) { setProductHighlightedIndex(i => Math.min((filtered.length - 1), i + 1)); setProductSuggestionsVisible(true) } }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setProductHighlightedIndex(i => Math.max(-1, i - 1)) }
                  else if (e.key === 'Enter') {
                    e.preventDefault()
                    if (productSuggestionsVisible && filtered.length > 0 && productHighlightedIndex >= 0 && productHighlightedIndex < filtered.length) {
                      const sel = filtered[productHighlightedIndex]
                      if (sel) {
                        setNewItem(n => {
                          const qty = Number(n.qty) || 0
                          const unit = Number(n.est_rate) || Number(n.sp_rate) || (n.gross ? Number(n.gross) / Math.max(1, qty) : 0)
                          const grossLine = unit * qty
                          let discountAmount = 0
                          if ((n.discount_mode || 'pct') === 'pct') {
                            const dp = Number(n.discount_pct) || 0
                            discountAmount = grossLine * (dp / 100)
                          } else {
                            discountAmount = Number(n.discount_rs) || 0
                          }
                          const tPct = (sel.tax_percent != null ? sel.tax_percent : (sel.taxPercent != null ? sel.taxPercent : (Number(n.tax_pct) || 0))) + (Number(n.sales_tax_pct) || 0) + (Number(n.cess_pct) || 0)
                          const taxAmount = (grossLine * tPct) / 100
                          const costLine = grossLine + taxAmount - discountAmount
                          const costPerUnit = qty > 0 ? Number((costLine / qty).toFixed(2)) : Number(unit.toFixed(2))

                          const mrpVal = Number(sel.mrp || 0)
                          const retailVal = Number(sel.price || sel.retail_price || 0)
                          const wholesaleVal = Number(sel.wholesale_price || 0)
                          const spVal = Number(sel.special_price || 0)

                          const mrp_profit_pct = mrpVal ? Number((((mrpVal - costPerUnit) / mrpVal) * 100).toFixed(2)) : 0
                          const retail_profit_pct = retailVal ? Number((((retailVal - costPerUnit) / retailVal) * 100).toFixed(2)) : 0
                          const wholesale_profit_pct = wholesaleVal ? Number((((wholesaleVal - costPerUnit) / wholesaleVal) * 100).toFixed(2)) : 0
                          const sp_profit_pct = spVal ? Number((((spVal - costPerUnit) / spVal) * 100).toFixed(2)) : 0

                          return ({
                            ...n,
                            product_id: sel.id,
                            sku: sel.sku || '',
                            name: sel.name || '',
                            mrp: sel.mrp || 0,
                            retail_price: sel.price || sel.retail_price || 0,
                            wholesale_price: sel.wholesale_price || 0,
                            special_price: sel.special_price || 0,
                            tax_pct: (sel.tax_percent != null ? sel.tax_percent : (sel.taxPercent != null ? sel.taxPercent : (Number(n.tax_pct) || 0))),
                            sales_tax_pct: (sel.tax_percent != null ? sel.tax_percent : (sel.taxPercent != null ? sel.taxPercent : (Number(n.sales_tax_pct) || 0))),
                            mrp_profit_pct,
                            retail_profit_pct,
                            wholesale_profit_pct,
                            sp_profit_pct
                          })
                        })
                        ignoreNextProductFetch.current = true
                        setProductSearch(sel.name || '')
                        setProductSuggestionsVisible(false)
                      }
                    }
                  }
                }}
              />
              {productSuggestionsVisible && (productSearch||'').trim().length >= 3 && (productSuggestions || []).filter(ps => ((ps.name||'').toLowerCase().includes((productSearch||'').toLowerCase()) || (ps.sku||'').toLowerCase().includes((productSearch||'').toLowerCase()))).length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 40, background: 'white', border: '1px solid var(--color-border)', maxHeight: 260, overflow: 'auto', marginTop: 6, boxShadow: '0 12px 30px rgba(2,6,23,0.08)', borderRadius: 8 }}>
                  {(productSuggestions || []).filter(ps => ((ps.name||'').toLowerCase().includes((productSearch||'').toLowerCase()) || (ps.sku||'').toLowerCase().includes((productSearch||'').toLowerCase()))).map((p, idx) => (
                    <div
                      key={p.id}
                      onMouseDown={() => { setNewItem(n => {
                          const qty = Number(n.qty) || 0
                          const unit = Number(n.est_rate) || Number(n.sp_rate) || (n.gross ? Number(n.gross) / Math.max(1, qty) : 0)
                          const grossLine = unit * qty
                          let discountAmount = 0
                          if ((n.discount_mode || 'pct') === 'pct') {
                            const dp = Number(n.discount_pct) || 0
                            discountAmount = grossLine * (dp / 100)
                          } else {
                            discountAmount = Number(n.discount_rs) || 0
                          }
                          const tPct = (p.tax_percent != null ? p.tax_percent : (p.taxPercent != null ? p.taxPercent : (Number(n.tax_pct) || 0))) + (Number(n.sales_tax_pct) || 0) + (Number(n.cess_pct) || 0)
                          const taxAmount = (grossLine * tPct) / 100
                          const costLine = grossLine + taxAmount - discountAmount
                          const costPerUnit = qty > 0 ? Number((costLine / qty).toFixed(2)) : Number(unit.toFixed(2))

                          const mrpVal = Number(p.mrp || 0)
                          const retailVal = Number(p.price || p.retail_price || 0)
                          const wholesaleVal = Number(p.wholesale_price || 0)
                          const spVal = Number(p.special_price || 0)

                          const mrp_profit_pct = mrpVal ? Number((((mrpVal - costPerUnit) / mrpVal) * 100).toFixed(2)) : 0
                          const retail_profit_pct = retailVal ? Number((((retailVal - costPerUnit) / retailVal) * 100).toFixed(2)) : 0
                          const wholesale_profit_pct = wholesaleVal ? Number((((wholesaleVal - costPerUnit) / wholesaleVal) * 100).toFixed(2)) : 0
                          const sp_profit_pct = spVal ? Number((((spVal - costPerUnit) / spVal) * 100).toFixed(2)) : 0

                          return ({ ...n, product_id: p.id, sku: p.sku || '', name: p.name || '', mrp: p.mrp || 0, retail_price: p.price || p.retail_price || 0, wholesale_price: p.wholesale_price || 0, special_price: p.special_price || 0, tax_pct: (p.tax_percent != null ? p.tax_percent : (p.taxPercent != null ? p.taxPercent : (Number(n.tax_pct) || 0))), sales_tax_pct: (p.tax_percent != null ? p.tax_percent : (p.taxPercent != null ? p.taxPercent : (Number(n.sales_tax_pct) || 0))), mrp_profit_pct, retail_profit_pct, wholesale_profit_pct, sp_profit_pct })
                        }); ignoreNextProductFetch.current = true; setProductSearch(p.name || ''); setProductSuggestionsVisible(false); setProductHighlightedIndex(-1) }}
                      style={{ padding: '8px 10px', cursor: 'pointer', background: productHighlightedIndex === idx ? 'var(--color-surface-2)' : 'transparent', borderBottom: '1px solid rgba(0,0,0,0.02)' }}
                    >
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{p.sku || ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="field-label">Qty</label>
              <input className="small-input" type="number" value={newItem.qty} onChange={e => {
                const v = Number(e.target.value || 0)
                setNewItem(n => {
                  const qty = Number(v) || 0
                  if ((Number(n.gross) || 0) > 0) {
                    const est = qty > 0 ? Number((Number(n.gross) / qty).toFixed(2)) : 0
                    return { ...n, qty, est_rate: est }
                  }
                  if ((Number(n.est_rate) || 0) > 0) {
                    const gross = Number((qty * Number(n.est_rate)).toFixed(2))
                    return { ...n, qty, gross }
                  }
                  return { ...n, qty }
                })
              }} />
            </div>

            <div>
              <label className="field-label">Gross Amount</label>
              <input className="small-input" type="number" value={newItem.gross} onChange={e => {
                const v = Number(e.target.value || 0)
                setNewItem(n => {
                  const qty = Number(n.qty) || 0
                  const gross = Number(v) || 0
                  const est = qty > 0 ? Number((gross / qty).toFixed(2)) : 0
                  return { ...n, gross, est_rate: est }
                })
              }} />
            </div>

            <div className="est-rate-col">
              <label className="field-label">Est. Rate</label>
              <input className="small-input" type="number" value={newItem.est_rate} onChange={e => {
                const v = Number(e.target.value || 0)
                setNewItem(n => {
                  const qty = Number(n.qty) || 0
                  const est = Number(v) || 0
                  const gross = Number((qty * est).toFixed(2))
                  return { ...n, est_rate: est, gross }
                })
              }} />
            </div>

            <div className="discount-col" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ minWidth: 140 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label className="field-label" style={{ marginBottom: 6 }}>Net discount</label>
                  <div className="segmented small" role="tablist" aria-label="Discount mode">
                    <input id="disc-pct" type="radio" name={`disc-mode-${Math.random().toString(36).slice(2)}`} value="pct" checked={newItem.discount_mode === 'pct'} onChange={() => setNewItem(n => ({ ...n, discount_mode: 'pct' }))} />
                    <label htmlFor="disc-pct" className={newItem.discount_mode === 'pct' ? 'active' : ''}>%</label>
                    <input id="disc-rs" type="radio" name={`disc-mode-${Math.random().toString(36).slice(2)}`} value="rs" checked={newItem.discount_mode === 'rs'} onChange={() => setNewItem(n => ({ ...n, discount_mode: 'rs' }))} />
                    <label htmlFor="disc-rs" className={newItem.discount_mode === 'rs' ? 'active' : ''}>₹</label>
                  </div>
                </div>
                {newItem.discount_mode === 'pct' ? (
                  <input className="small-input" type="number" value={newItem.discount_pct} onChange={e => setNewItem(n => ({ ...n, discount_pct: Number(e.target.value||0) }))} />
                ) : (
                  <input className="small-input" type="number" value={newItem.discount_rs} onChange={e => setNewItem(n => ({ ...n, discount_rs: Number(e.target.value||0) }))} />
                )}
              </div>
            </div>
          </div>

          <div className="item-entry-row">
            <div>
              <label className="field-label">Expiry Date</label>
              <input type="date" value={newItem.expiry || ''} onChange={e => setNewItem(n => ({ ...n, expiry: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Tax (%)</label>
              <select value={newItem.tax_pct || 0} onChange={e => setNewItem(n => ({ ...n, tax_pct: Number(e.target.value||0) }))}>
                <option value={0}>0%</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
                <option value={40}>40%</option>
              </select>
            </div>
            <div>
              <label className="field-label">Sales Tax (%)</label>
              <select value={newItem.sales_tax_pct || 0} onChange={e => setNewItem(n => ({ ...n, sales_tax_pct: Number(e.target.value||0) }))}>
                <option value={0}>0%</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
                <option value={40}>40%</option>
              </select>
            </div>
            <div>
              <label className="field-label">Cess (%)</label>
              <select value={newItem.cess_pct || 0} onChange={e => setNewItem(n => ({ ...n, cess_pct: Number(e.target.value||0) }))}>
                <option value={0}>0%</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
                <option value={40}>40%</option>
              </select>
            </div>
            <div>
              <label className="field-label">MRP</label>
              <input type="number" value={newItem.mrp || 0} onChange={e => setNewItem(n => ({ ...n, mrp: Number(e.target.value||0) }))} />
            </div>
            <div>
              <label className="field-label">MRP Profit (%)</label>
              <input type="number" value={newItem.mrp_profit_pct || 0} onChange={e => setNewItem(n => ({ ...n, mrp_profit_pct: Number(e.target.value||0) }))} />
            </div>
          </div>

          <div className="item-entry-row">
            <div>
              <label className="field-label">Retail Price</label>
              <input type="number" value={newItem.retail_price || 0} onChange={e => setNewItem(n => ({ ...n, retail_price: Number(e.target.value||0) }))} />
            </div>
            <div>
              <label className="field-label">Retail Profit (%)</label>
              <input type="number" value={newItem.retail_profit_pct || 0} onChange={e => setNewItem(n => ({ ...n, retail_profit_pct: Number(e.target.value||0) }))} />
            </div>
            <div>
              <label className="field-label">Wholesale</label>
              <input type="number" value={newItem.wholesale_price || 0} onChange={e => setNewItem(n => ({ ...n, wholesale_price: Number(e.target.value||0) }))} />
            </div>
            <div>
              <label className="field-label">Wholesale profit (%)</label>
              <input type="number" value={newItem.wholesale_profit_pct || 0} onChange={e => setNewItem(n => ({ ...n, wholesale_profit_pct: Number(e.target.value||0) }))} />
            </div>
            <div>
              <label className="field-label">Special Price</label>
              <input type="number" value={newItem.special_price || 0} onChange={e => setNewItem(n => ({ ...n, special_price: Number(e.target.value||0) }))} />
            </div>
            <div>
              <label className="field-label">SP profit (%)</label>
              <input type="number" value={newItem.sp_profit_pct || 0} onChange={e => setNewItem(n => ({ ...n, sp_profit_pct: Number(e.target.value||0) }))} />
            </div>
          </div>

          <div className="item-entry-actions">
            <button className="btn" onClick={() => addItem()}>{editingIndex >= 0 ? 'Update' : 'Add [F2]'}</button>
            {editingIndex >= 0 && (
              <button className="btn btn-ghost" onClick={() => { setNewItem(getEmptyNewItem()); setEditingIndex(-1); try { productSelectRef.current && productSelectRef.current.focus() } catch (e) {} }}>Cancel</button>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <table className="products-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>MRP</th>
                  <th>Selling</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Gross Amt</th>
                  <th>After Disc</th>
                  <th>Tax %</th>
                  <th>Cess %</th>
                  <th>Total Amt</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>{i+1}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{it.name || ''}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{it.barcode || it.sku || ''}</div>
                    </td>
                    <td>{it.mrp ? `₹ ${Number(it.mrp).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : ''}</td>
                    <td>{it.retail_price ? `₹ ${Number(it.retail_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : ''}</td>
                    <td>{it.qty ?? 0}</td>
                    <td>₹ {Number(it.unit_price || it.est_rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td>{it.gross_amount ? `₹ ${Number(it.gross_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : it.gross ? `₹ ${Number(it.gross).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹ 0.00'}</td>
                    <td>{it.after_discount ? `₹ ${Number(it.after_discount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : it.line_total ? `₹ ${Number(it.line_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹ 0.00'}</td>
                    <td>{(it.tax_pct || 0) + (it.sales_tax_pct || 0)}%</td>
                    <td>{it.cess_pct ? `${it.cess_pct}%` : '0%'}</td>
                    <td>{it.total_amount ? `₹ ${Number(it.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `₹ ${Number(it.line_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="icon-btn" title="Edit item" onClick={() => { setNewItem({ ...it }); setEditingIndex(i); try { productSelectRef.current && productSelectRef.current.focus() } catch (e) {} }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="currentColor" />
                          <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" fill="currentColor" />
                        </svg>
                      </button>
                      <button className="icon-btn" title="Remove item" onClick={() => removeItem(i)} style={{ color: 'var(--color-danger)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <path d="M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7z" fill="currentColor" />
                          <path d="M9 4h6l1 1h3v2H5V5h3l1-1z" fill="currentColor" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={12}>No items</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div>Subtotal: ₹ {Number(totals.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <div style={{ marginTop: 8 }}><strong>Total: ₹ {Number(totals.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
            </div>
          </div>

        </div>

        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 160 }} className={mismatch ? 'field-error' : ''}>
                  <label className="field-label">Total</label>
                  <input readOnly value={Number(totals.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })} />
                </div>
                <div style={{ minWidth: 160 }}>
                  <label className="field-label">Discount (₹)</label>
                  <input value={purchase.metadata?.discount || 0} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, discount: Number(e.target.value||0) } }))} />
                </div>
                <div style={{ minWidth: 160 }}>
                  <label className="field-label">Round off</label>
                  <input value={purchase.metadata?.round_off || 0} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, round_off: Number(e.target.value||0) } }))} />
                </div>
                <div style={{ minWidth: 160 }}>
                  <label className="field-label">Bill Amount</label>
                  <input value={purchase.metadata?.bill_amount ?? Number(billAmount).toFixed(2)} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, bill_amount: Number(e.target.value || 0) } }))} />
                </div>
                <div style={{ minWidth: 160 }}>
                  <label className="field-label">Expence</label>
                  <input value={purchase.metadata?.expense || 0} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, expense: Number(e.target.value||0) } }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <div style={{ minWidth: 320 }}>
                  <label className="field-label">Description</label>
                  <input value={purchase.metadata?.description || ''} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, description: e.target.value } }))} />
                </div>
              </div>
            </div>

            <div style={{ width: 320 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Paid</label>
                  <input value={purchase.metadata?.paid || 0} onChange={e => setPurchase(p => ({ ...p, metadata: { ...p.metadata, paid: Number(e.target.value||0) } }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Balance</label>
                  <input readOnly value={Number(balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => window.location.reload()}>Reset</button>
                <button className="btn primary" disabled={saving} onClick={() => save()}>{saving ? 'Saving...' : 'Save [F12]'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
