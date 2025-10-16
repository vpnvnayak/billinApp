import React, { useState, useEffect, useRef } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import api from '../services/api'

export default function POS() {
  // helper to format numbers as Indian rupees
  function formatCurrency(n, opts = {}) {
    const num = Number(n) || 0
    const fd = Object.assign({ minimumFractionDigits: 2, maximumFractionDigits: 2 }, opts)
    return `₹ ${num.toLocaleString('en-IN', fd)}`
  }
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [cart, setCart] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef()
  const timer = useRef()

  useEffect(() => {
    if (!query) { setResults([]); setSelectedIndex(-1); return }
    setLoading(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get('/pos/products', { params: { query, limit: 10 } })
        setResults(r.data || [])
        setSelectedIndex(r.data && r.data.length ? 0 : -1)
      } catch (err) {
        console.error(err)
        setResults([])
      } finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(timer.current)
  }, [query])

  useEffect(() => {
    function onKey(e) {
      if (document.activeElement === inputRef.current) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min((results.length || 0) - 1, Math.max(0, i + 1))) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(0, i - 1)) }
        if (e.key === 'Enter') { e.preventDefault(); if (selectedIndex >= 0 && results[selectedIndex]) addProduct(results[selectedIndex]) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, selectedIndex])

  // when user presses Enter in the barcode input (scanner sends Enter),
  // immediately try to add the matched product. Debounce used for live search
  // can be bypassed here to handle scanner input which arrives quickly.
  async function handleInputKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // if UI already has a selected result, use it
    if (selectedIndex >= 0 && results[selectedIndex]) {
      addProduct(results[selectedIndex])
      return
    }
    const q = (query || '').trim()
    if (!q) return
    // clear pending debounce so we don't do duplicate requests
    clearTimeout(timer.current)
    try {
      setLoading(true)
      const r = await api.get('/pos/products', { params: { query: q, limit: 10 } })
      const items = r.data || []
      setResults(items)
      if (items.length > 0) {
        // prefer exact sku match if present
        const exact = items.find(it => String(it.sku || '').toLowerCase() === q.toLowerCase()) || items[0]
        addProduct(exact)
      } else {
        import('../services/ui').then(m => m.showSnackbar('Product not found'))
      }
    } catch (err) {
      console.error('barcode lookup failed', err)
      import('../services/ui').then(m => m.showSnackbar('Failed to lookup product'))
    } finally {
      setLoading(false)
    }
  }

  // load customers from backend and refresh on changes
  async function loadCustomers() {
    try {
      const r = await api.get('/customers')
      // API may return either an array or a paginated object { data, total }
      if (r.data && Array.isArray(r.data.data)) {
        setCustomers(r.data.data)
      } else if (Array.isArray(r.data)) {
        setCustomers(r.data)
      } else {
        setCustomers([])
      }
    } catch (e) { console.error('failed to load customers', e); setCustomers([]) }
  }

  useEffect(() => {
    loadCustomers()
    function onChanged() { loadCustomers() }
    // expose legacy/global aliases so other pages or older bundles can trigger a reload
    if (typeof window !== 'undefined') {
      try { window.loadCustomersFromServer = loadCustomers } catch (e) {}
      try { window.loadCustomers = loadCustomers } catch (e) {}
    }
    window.addEventListener('customers:changed', onChanged)
    return () => {
      window.removeEventListener('customers:changed', onChanged)
      if (typeof window !== 'undefined') {
        try { delete window.loadCustomersFromServer } catch (e) {}
        try { delete window.loadCustomers } catch (e) {}
      }
    }
  }, [])

  // autofocus barcode input when POS mounts
  useEffect(() => {
    try { inputRef.current && inputRef.current.focus() } catch (e) {}
  }, [])

  // expose print helpers so other pages (Sales) can invoke printing
  useEffect(() => {
    // prefer existing names but set multiple aliases
    function handler(sale) {
      try {
        // items and payment_breakdown might be persisted in sale.metadata
        const items = sale.items || sale.sale_items || (sale.metadata && sale.metadata.items) || []
        const pb = sale.payment_breakdown || sale.metadata || {}
        printReceipt(sale, items, pb)
  } catch (e) { console.error('print handler error', e); import('../services/ui').then(m => m.showAlert('Failed to print')) }
    }
    if (typeof window !== 'undefined') {
      window.window_printthermal = handler
      window.printThermal = handler
      window.__printThermal = handler
    }
    return () => {
      if (typeof window !== 'undefined') {
        try { delete window.window_printthermal } catch (e) {}
        try { delete window.printThermal } catch (e) {}
        try { delete window.__printThermal } catch (e) {}
      }
    }
  }, [])

  function addProduct(p) {
    setCart(c => {
      // if same product (by id) exists, increment its qty instead of adding a new line
      const existing = c.find(it => it.id === p.id)
      if (existing) {
        return c.map(it => it.id === p.id ? { ...it, qty: Number(it.qty || 0) + 1 } : it)
      }
      const item = { ...p, qty: 1 }
      return [...c, item]
    })
    setQuery('')
    setResults([])
    setSelectedIndex(-1)
    try { inputRef.current.focus() } catch (e) {}
  }

  // Cart editing helpers
  function updateCartItem(id, patch) {
    setCart(c => c.map(it => it.id === id ? { ...it, ...patch } : it))
  }
  function removeCartItem(id) {
    setCart(c => c.filter(it => it.id !== id))
  }

  // Create a local customer (temporary, client-side). In a real app you'd POST to /customers.
  async function createCustomer(name) {
    if (!name || !name.trim()) return
    try {
      const r = await api.post('/customers', { name: name.trim() })
  // ensure list updated and select newly created
  setCustomers(s => Array.isArray(s) ? [r.data, ...s] : [r.data])
      setSelectedCustomer(r.data.id)
      setShowCreateCustomer(false)
      setNewCustomerName('')
      try { window.dispatchEvent(new CustomEvent('customers:changed')) } catch (e) {}
    } catch (e) {
      console.error('create customer failed', e)
      import('../services/ui').then(m => m.showAlert('Failed to create customer'))
    }
  }

  // Totals
  function computeTotals() {
    let subtotal = 0
    let tax_total = 0
    for (const it of cart) {
      const qty = Number(it.qty) || 0
      const price = Number(it.price) || 0
      const line = qty * price
      subtotal += line
      const tax = (Number(it.tax_percent) || 0) / 100.0
      tax_total += line * tax
    }
    const grand = subtotal + tax_total
    return { subtotal, tax_total, grand }
  }

  // Payment modal state
  const [showPay, setShowPay] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [payMethod, setPayMethod] = useState('cash')
  const [cashGiven, setCashGiven] = useState('')
  const [discountPercent, setDiscountPercent] = useState(0)
  const [discountRs, setDiscountRs] = useState(0)
  const [loyalty, setLoyalty] = useState(0)
  const [cardAmount, setCardAmount] = useState(0)
  const [upiAmount, setUpiAmount] = useState(0)
  const [saleResult, setSaleResult] = useState(null)
  const [remarks, setRemarks] = useState('')

  async function submitPayment() {
    if (cart.length === 0) return
    setPayLoading(true)
    function safeInt32(v) {
      const n = Number(v)
      if (!Number.isFinite(n)) return null
      if (!Number.isInteger(n)) return null
      if (n < -2147483648 || n > 2147483647) return null
      return n
    }

    const payload = {
      items: cart.map(it => ({ product_id: safeInt32(it.id), sku: it.sku, name: it.name, qty: it.qty, price: it.price, tax_percent: it.tax_percent })),
      payment_method: payMethod,
      payment_breakdown: { card: Number(cardAmount)||0, cash: Number(cashGiven)||0, upi: Number(upiAmount)||0, discount_percent: Number(discountPercent)||0, discount_rs: Number(discountRs)||0, loyalty: Number(loyalty)||0, remarks: remarks || '' },
      user_id: selectedCustomer || null
    }
    try {
      const r = await api.post('/sales', payload)
      setSaleResult(r.data)
      // print receipt (A3) using snapshot of items and breakdown
      try {
        printReceipt(r.data, payload.items, payload.payment_breakdown)
      } catch (e) {
        console.error('print failed', e)
      }
      // clear cart on success
      setCart([])
      setShowPay(false)
      // focus barcode input so cashier can continue scanning
      try { inputRef.current && inputRef.current.focus() } catch (e) {}
    } catch (err) {
      console.error('Sale error', err)
      import('../services/ui').then(m => m.showAlert((err && err.response && err.response.data && err.response.data.error) || 'Failed to create sale'))
    } finally {
      setPayLoading(false)
    }
  }

  function printReceipt(sale, items, payment_breakdown) {
    // Use thermal 80mm template
    const html = buildThermalReceiptHtml(sale, items, payment_breakdown)
    const w = window.open('', '_blank', 'width=1200,height=1600')
    if (!w) return
    w.document.write(html)
    w.document.close()
    // allow load then print
    w.onload = () => {
      w.focus()
      w.print()
    }
  }

  function buildReceiptHtml(sale, items, pb) {
    // compute totals from provided items (don't rely on current cart)
    let subtotal = 0
    let tax_total = 0
    for (const it of items || []) {
      const qty = Number(it.qty) || 0
      const price = Number(it.price) || 0
      const line = qty * price
      subtotal += line
      const tax = (Number(it.tax_percent) || 0) / 100.0
      tax_total += line * tax
    }
    const t = { subtotal, tax_total, grand: subtotal + tax_total }
    // simple A3 stylesheet and layout
    const rows = items.map((it, i) => {
      const price = Number(it.price) || 0
      const line = (Number(it.qty)||0) * price
      return `<tr><td>${i+1}</td><td>${it.sku||''}</td><td>${it.name}</td><td>${it.qty}</td><td>${formatCurrency(price)}</td><td>${formatCurrency(line)}</td></tr>`
    }).join('')
    const paymentLines = Object.entries(pb || {}).map(([k,v]) => `<div><strong>${k}</strong>: ${typeof v === 'number' ? formatCurrency(v) : v}</div>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>@page{size:A3 landscape;margin:20mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse}th,td{padding:6px;border-bottom:1px solid #ddd;text-align:left}tfoot td{font-weight:700} .right{text-align:right}</style></head><body><h1>Receipt - Sale ${sale.id}</h1><div>${new Date().toLocaleString()}</div><table><thead><tr><th>#</th><th>SKU</th><th>Item</th><th>Qty</th><th>Price</th><th class="right">Line Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5">Subtotal</td><td class="right">${t.subtotal.toFixed(2)}</td></tr><tr><td colspan="5">Tax</td><td class="right">${t.tax_total.toFixed(2)}</td></tr><tr><td colspan="5">Grand Total</td><td class="right">${t.grand.toFixed(2)}</td></tr></tfoot></table><h3>Payment</h3>${paymentLines}<div style="margin-top:20px">Thank you for your purchase.</div></body></html>`
  }

  function buildThermalReceiptHtml(sale, items, pb) {
    // compute totals from provided items (so printing works independently of cart)
    let subtotalNum = 0
    let tax_totalNum = 0
    for (const it of items || []) {
      const qty = Number(it.qty) || 0
      const price = Number(it.price) || 0
      const line = qty * price
      subtotalNum += line
      const tax = (Number(it.tax_percent) || 0) / 100.0
      tax_totalNum += line * tax
    }
  const subtotal = subtotalNum
  const tax_total = tax_totalNum
  const grand = subtotalNum + tax_totalNum
    const now = new Date()
    const invoiceNo = sale.id || ''
    const dateStr = now.toLocaleDateString()
    const timeStr = now.toLocaleTimeString()

    const rows = items.map((it, i) => {
      const name = (it.name || '').toUpperCase()
      const mrp = it.mrp != null ? Number(it.mrp) : ''
      const qty = Number(it.qty||0)
      const rate = Number(it.price||0)
      const total = qty * rate
      return `<tr><td style="font-weight:700">${name}</td></tr><tr><td>${mrp ? formatCurrency(mrp) : ''} &nbsp; ${qty} x ${formatCurrency(rate, { minimumFractionDigits:0, maximumFractionDigits:0 })} &nbsp; ${formatCurrency(total, { minimumFractionDigits:0, maximumFractionDigits:0 })}</td></tr>`
    }).join('')

  const card = (pb && pb.card) ? Number(pb.card) : 0
  const cash = (pb && pb.cash) ? Number(pb.cash) : 0
  const upi = (pb && pb.upi) ? Number(pb.upi) : 0

    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 2mm }
        body{ width:80mm; font-family: Arial, Helvetica, sans-serif; font-size:12px; color:#000; }
        .center{ text-align:center }
        .b { font-weight:700 }
        .sep { border-top:1px solid #000; margin:6px 0 }
        table{ width:100%; border-collapse:collapse; }
        td{ padding:2px 0 }
        .right{ text-align:right }
        .small{ font-size:11px }
      </style>
    </head><body>
      <div class="center b" style="font-size:14px">GROCA<br/>KUNDAMANKADAV</div>
      <div class="center small">Ground Floor, Devi Arcade,<br/>kundamankadavu, Trivandrum-695013</div>
      <div class="center small">Ph: 9567171729<br/>GSTIN: 32AALCG0917G1ZW</div>
      <div class="sep"></div>
      <div>Invoice No : ${invoiceNo}</div>
      <div>Invoice Date : ${dateStr} ${timeStr}</div>
      <div class="sep"></div>
      <table>
        <thead>
          <tr><td class="b">Item Name</td></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="sep"></div>
    <div>Total Items: ${items.length}</div>
  <div>Mrp Total: ${formatCurrency(subtotal)}</div>
  <div class="b">Net Amount: ${formatCurrency(grand)}</div>
      <div class="sep"></div>
      <table>
        <tr><td>Taxable</td><td class="right">${formatCurrency(subtotal)}</td></tr>
        <tr><td>Tax%</td><td class="right">--</td></tr>
        <tr><td>CGST</td><td class="right">${formatCurrency(Number(tax_total)/2)}</td></tr>
        <tr><td>SGST</td><td class="right">${formatCurrency(Number(tax_total)/2)}</td></tr>
      </table>
      <div class="sep"></div>
  <div>Old Balance <span class="right">${formatCurrency(0)}</span></div>
  <div>Sales <span class="right">${formatCurrency(grand)}</span></div>
  <div>Cash Received <span class="right">${formatCurrency(cash)}</span></div>
      <div class="sep"></div>
      <div class="center b">THANK YOU VISIT AGAIN</div>
    </body></html>`
  }

  // no mock add helper — use real products via search

  const totals = computeTotals()
  const totalAmount = totals.grand
  const dp = Number(discountPercent) || 0
  const calcDiscountRs = (dp/100) * totalAmount
  const drs = Number(discountRs) || calcDiscountRs || 0
  const payable = Math.max(0, totalAmount - drs - (Number(loyalty) || 0))
  const paid = (Number(cardAmount) || 0) + (Number(upiAmount) || 0) + (Number(cashGiven) || 0)
  const balanceToBePaid = Math.max(0, payable - paid)
  const changeDue = Math.max(0, paid - payable)

  return (
    <div className="pos-page">
      <div className="pos-top">
        <div className="pos-search pos-search-half">
          <input ref={inputRef} placeholder="Search barcode" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleInputKeyDown} />
          <button className="icon"><MagnifyingGlassIcon style={{ width: 18, height: 18 }} /></button>
          {loading && <div className="pos-search-loading">…</div>}
          {results.length > 0 && (
            <div className="pos-results">
              {results.map((r, idx) => (
                <div key={r.id} className={`pos-result ${idx === selectedIndex ? 'selected' : ''}`} onClick={() => addProduct(r)}>
                  <div className="r-sku">{r.sku}</div>
                  <div className="r-name">{r.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="pos-controls" />
      </div>

      <div className="pos-body">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="pos-cart">
              <table className="pos-table">
                <thead>
                  <tr><th>#</th><th>Item</th><th>Qty</th><th>MRP</th><th>Tax</th><th>Price</th><th>Total</th><th></th></tr>
                </thead>
                <tbody>
                  {cart.length === 0 && <tr><td colSpan={8}>No Products Added For Selling...</td></tr>}
                  {cart.map((it, i) => (
                    <tr key={it.id}>
                      <td>{i+1}</td>
                      <td>{it.name}</td>
                      <td>
                        <input type="number" min="0" value={it.qty} onChange={e => updateCartItem(it.id, { qty: Number(e.target.value) })} className="small-input" />
                      </td>
                      <td>{it.mrp != null ? it.mrp : '-'}</td>
                      <td>{it.tax_percent}%</td>
                      <td>
                        <input type="number" min="0" step="0.01" value={it.price} onChange={e => updateCartItem(it.id, { price: Number(e.target.value) })} className="small-input" />
                      </td>
                      <td>{(Number(it.qty || 0) * Number(it.price || 0)).toFixed(2)}</td>
                      <td><button className="btn btn-ghost" onClick={() => removeCartItem(it.id)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="pos-panel" style={{ paddingLeft: 30 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, color: 'var(--color-muted)' }}>Customer</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={selectedCustomer || ''} onChange={e => setSelectedCustomer(e.target.value || null)} className="select-flex">
                  <option value="">Walk-in / None</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn btn-ghost" onClick={() => setShowCreateCustomer(true)}>Create</button>
              </div>
            </div>

            <div className="pos-panel-card">
              <h3>Totals</h3>
              {cart.length === 0 && <div>No items</div>}
              {cart.length > 0 && (
                <div>
                  <div>Subtotal: <strong>{totals.subtotal.toFixed(2)}</strong></div>
                  <div>Tax: <strong>{totals.tax_total.toFixed(2)}</strong></div>
                  <div style={{ marginTop: 8, fontSize: 18 }}>Grand Total: <strong>{totals.grand.toFixed(2)}</strong></div>
                  <div style={{ marginTop: 12 }}>
                    <button className="btn" onClick={() => setShowPay(true)}>Pay</button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {showPay && (
        <div className="modal-overlay">
          <div className="modal payment-modal">
            <h3>Payment</h3>
            <div className="pm-row">
              <label>Remarks</label>
              <input type="text" placeholder="Remarks/Cheque No." value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>

            <div className="pm-grid">
              <div className="pm-left">
                <div className="pm-total"><div>Total Amount</div><div className="pm-amt">{totalAmount.toFixed(2)}</div></div>
                <div className="pm-line discount-row"><div>Cash Discount %</div><div className="discount-controls"><input type="number" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} className="small-input" /><input type="number" value={discountRs} onChange={e => setDiscountRs(e.target.value)} className="small-input" placeholder="Rs" /></div></div>
                <div className="pm-line"><div>Loyalty</div><div><input type="number" value={loyalty} onChange={e => setLoyalty(e.target.value)} className="small-input" /></div></div>
                <div className="pm-line strong"><div>Payable Amount</div><div className="pm-amt">{payable.toFixed(2)}</div></div>
              </div>
              <div className="pm-right">
                <div className="pm-paymethod">
                  <div className="pm-method">Card</div>
                  <input type="number" value={cardAmount} onChange={e => setCardAmount(e.target.value)} />
                </div>
                <div className="pm-paymethod">
                  <div className="pm-method">Cash</div>
                  <input type="number" value={cashGiven} onChange={e => setCashGiven(e.target.value)} />
                </div>
                <div className="pm-paymethod">
                  <div className="pm-method">UPI</div>
                  <input type="number" value={upiAmount} onChange={e => setUpiAmount(e.target.value)} />
                </div>
                <div className="pm-line"><div>Bill Balance</div><div className="pm-amt">{(payable - paid).toFixed(2)}</div></div>
              </div>
            </div>

            <div className="pm-footer">
              <div>
                {changeDue > 0 ? <div>Change Due <span className="pm-change">{changeDue.toFixed(2)}</span></div> : null}
                <div>Balance Amount To Be Paid <span className="pm-balance">{balanceToBePaid.toFixed(2)}</span></div>
              </div>
              <div className="pm-actions">
                <button className="btn" onClick={submitPayment} disabled={payLoading || paid < payable}>{payLoading ? 'Processing...' : 'Save'}</button>
                <button className="btn btn-ghost" onClick={() => setShowPay(false)} style={{ marginLeft: 8 }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateCustomer && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create customer</h3>
            <div className="field">
              <label className="field-label">Name</label>
              <input type="text" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => createCustomer(newCustomerName)}>Create</button>
              <button className="btn btn-ghost" onClick={() => { setShowCreateCustomer(false); setNewCustomerName('') }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {saleResult && (
        <div className="receipt-overlay">
          <div className="receipt">
            <h4>Sale created</h4>
            <div>Sale ID: {saleResult.id}</div>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => setSaleResult(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
