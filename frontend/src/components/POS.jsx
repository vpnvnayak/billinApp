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
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerSuggestions, setCustomerSuggestions] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedCustomerLoyalty, setSelectedCustomerLoyalty] = useState(0)
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [cart, setCart] = useState([])
  const [results, setResults] = useState([])
  // when multiple products share the same SKU we show a single group and
  // prompt cashier to enter/select MRP. mrpPrompt = { group: [...products], sku, value }
  const [mrpPrompt, setMrpPrompt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef()
  const timer = useRef()
  const customerTimer = useRef()
  const customerSuppressRef = useRef(false)
  const mrpInputRef = useRef()

  // derive grouped results (one entry per SKU) for display
  const displayResults = (() => {
    if (!results || results.length === 0) return []
    const m = new Map()
    for (const r of results) {
      const key = String(r.sku || '').toLowerCase()
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(r)
    }
    return Array.from(m.values()).map(group => ({ item: group[0], group }))
  })()

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
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min((displayResults.length || 0) - 1, Math.max(0, i + 1))) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(0, i - 1)) }
        if (e.key === 'Enter') {
          e.preventDefault()
          if (selectedIndex >= 0 && displayResults[selectedIndex]) {
            const dr = displayResults[selectedIndex]
            // when selecting from suggestions, always confirm variants from server
            checkVariantsAndPrompt(dr.item)
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayResults, selectedIndex])

  // when user presses Enter in the barcode input (scanner sends Enter),
  // immediately try to add the matched product. Debounce used for live search
  // can be bypassed here to handle scanner input which arrives quickly.
  async function handleInputKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // if UI already has a selected result, use it
    if (selectedIndex >= 0 && displayResults[selectedIndex]) {
      const dr = displayResults[selectedIndex]
      if (dr.group && dr.group.length > 1) {
        setMrpPrompt({ group: dr.group, sku: String(dr.item.sku || ''), value: '' })
      } else {
        addProduct(dr.item)
      }
      return
    }
    const q = (query || '').trim()
    if (!q) return
    // clear pending debounce so we don't do duplicate requests
    clearTimeout(timer.current)
    try {
      setLoading(true)
      // Special encoded barcode format: starts with '#'
      // Format: #[6chars][5chars]..., where first 6 chars identify last-6 of SKU, next 5 chars encode quantity (qty = parseInt(next5)/1000)
      if (q[0] === '#') {
        const code = q.slice(1)
        const sixRaw = code.slice(0, 6)
        const fiveRaw = code.slice(6, 11)
        // require at least the 6-char product id portion
          if (sixRaw && sixRaw.length >= 1) {
          // interpret first 6 chars as store-specific product id: trim leading zeros
          let storeSeqStr = (sixRaw || '').toString().replace(/^0+/, '')
          if (!storeSeqStr) storeSeqStr = '0'
          // ask backend to return products for this store_seq when possible
          const r = await api.get('/pos/products', { params: { store_seq: storeSeqStr, limit: 50 } })
          const items = r.data || []
          const targetDigits = (sixRaw || '').toString().replace(/\D/g, '')
          const parsedItems = items.filter(it => {
            const skuRaw = String(it.sku || it.barcode || '')
            const digits = (skuRaw || '').toString().replace(/\D/g, '')
            const skuLast6 = (digits && digits.length > 0) ? digits.slice(-6).padStart(6, '0') : String(skuRaw || '').slice(-6).padStart(6, '0')
            if (targetDigits && targetDigits.length > 0) {
              const tgt = targetDigits.padStart(6, '0')
              return skuLast6 === tgt
            }
            // fallback compare raw substrings (case-insensitive)
            return String(skuRaw || '').slice(-6).padStart(6, '0').toLowerCase() === String(sixRaw || '').padStart(6, '0').toLowerCase()
          })
          let exact = null
          if (parsedItems.length > 0) {
            exact = parsedItems[0]
          } else {
            // Looser fallback: try substring match on raw sku/barcode or match by store_seq
            const loose = items.filter(it => {
              const skuRaw = String(it.sku || it.barcode || '') || ''
              if (skuRaw.toLowerCase().includes((sixRaw || '').toLowerCase())) return true
              // numeric fallback: compare store_seq if present
              if (it.store_seq != null && String(it.store_seq).padStart(6, '0') === String(sixRaw || '').padStart(6, '0')) return true
              // compare digits as substring
              const digits = (skuRaw || '').toString().replace(/\D/g, '')
              if (digits && digits.includes((targetDigits || '').toString())) return true
              return false
            })
            if (loose.length === 0) {
              import('../services/ui').then(m => m.showSnackbar('Product not found'))
              return
            }
            // use the first loose match
            exact = loose[0]
          }
          // compute quantity from fiveRaw: interpret as integer over 1000
          let qty = 1
          if (fiveRaw && fiveRaw.length > 0) {
            const n = parseInt(fiveRaw.replace(/\D/g, ''), 10)
            if (!Number.isNaN(n)) qty = n / 1000
          }
          // verify variants and add product with qty
          await checkVariantsAndPrompt(exact, qty)
          return
        }
      }
      const r = await api.get('/pos/products', { params: { query: q, limit: 10 } })
      const items = r.data || []
      setResults(items)
      if (items.length > 0) {
        const exactKey = q.toLowerCase()
        const matched = items.filter(it => String(it.sku || '').toLowerCase() === exactKey)
        const exact = matched[0] || items[0]
        // always verify with server whether multiple variants exist
        await checkVariantsAndPrompt(exact)
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
        // if selectedCustomer present, refresh loyalty value
        if (selectedCustomer) {
          const found = (r.data.data || []).find(c => String(c.id) === String(selectedCustomer))
          if (found) setSelectedCustomerLoyalty(Number(found.loyalty_points || 0))
        }
      } else if (Array.isArray(r.data)) {
        setCustomers(r.data)
      } else {
        setCustomers([])
      }
    } catch (e) { console.error('failed to load customers', e); setCustomers([]) }
  }

  // Helper: given a product-like item (from /pos/products result), ask backend for all variants for the SKU
  // If multiple variants are present, open the mrp prompt. If a single variant or variant_id present, add that variant directly.
  async function checkVariantsAndPrompt(item, qty = 1) {
    try {
      const sku = String(item.sku || '')
      if (!sku) { addProduct(item); return }
      // Query pos/products with the sku to get all matching rows (variants preferred by backend)
      const r = await api.get('/pos/products', { params: { query: sku, limit: 50 } })
      const items = r.data || []
      // filter exact sku matches
      const matched = items.filter(it => String(it.sku || '').toLowerCase() === sku.toLowerCase())
      if (matched.length === 0) {
        // fallback: add the original item with qty
        addProduct(item, qty)
        return
      }
      // If any matched item includes variant_id and there is exactly one unique mrp, add that
      // treat numerically-equal MRPs as the same (e.g. 30 and 30.00)
      const uniqueMrps = Array.from(new Set(matched.map(m => {
        if (m.mrp == null || m.mrp === '') return '__NULL__'
        const n = Number(String(m.mrp).replace(/,/g, '').trim())
        return Number.isFinite(n) ? String(n) : String(m.mrp)
      }))).filter(x => x !== '__NULL__')
      if (matched.length === 1 || uniqueMrps.length === 1) {
        // prefer the first matched (should have variant_id if variant exists)
        addProduct(matched[0], qty)
      } else {
        // multiple MRPs available -> prompt cashier to type exact MRP
        setMrpPrompt({ group: matched, sku, value: '', __qty: qty })
      }
    } catch (e) {
      console.error('variant check failed', e)
      // fallback: add item
      addProduct(item, qty)
    }
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

  // compute suggestions for customer search (filter by phone or name)
  useEffect(() => {
    // debounce and call server for customer search
    clearTimeout(customerTimer.current)
    const q = (customerQuery || '').trim()
    // do not show suggestions if suppressed (user just selected) until they type again
    if (customerSuppressRef.current) {
      setCustomerSuggestions([])
      return
    }
    // require minimum 3 characters to trigger suggestions
    if (!q || q.length < 3) {
      setCustomerSuggestions([])
      return
    }
    customerTimer.current = setTimeout(async () => {
      try {
        const r = await api.get('/customers', { params: { q, limit: 20 } })
        const data = (r.data && (Array.isArray(r.data.data) ? r.data.data : r.data)) || []
        setCustomerSuggestions(data)
      } catch (e) {
        console.error('customer search failed', e)
        // fallback to client-side filter
        const qq = q.toLowerCase()
        const matches = (customers || []).filter(c => {
          const name = (c.name || '').toLowerCase()
          const phone = (c.phone || '').toLowerCase()
          return name.includes(qq) || phone.includes(qq) || String(c.id) === qq
        }).slice(0, 20)
        setCustomerSuggestions(matches)
      }
    }, 250)
    return () => clearTimeout(customerTimer.current)
  }, [customerQuery, customers])

  // autofocus barcode input when POS mounts
  useEffect(() => {
    try { inputRef.current && inputRef.current.focus() } catch (e) {}
  }, [])

  // autofocus MRP input when prompt opens
  useEffect(() => {
    if (mrpPrompt && mrpInputRef && mrpInputRef.current) {
      try { mrpInputRef.current.focus() } catch (e) {}
    }
  }, [mrpPrompt])

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

  function addProduct(p, qty = 1) {
    const qnum = Number(qty) || 0
    setCart(c => {
      // use a cartId that includes variant_id when present so different variants
      // of the same product are separate lines. Keep numeric `id` as product_id
      // for payloads so backend receives product_id and optional variant_id.
      const cartId = `${p.id}:${p.variant_id || 'm'}`
      const existing = c.find(it => it.cartId === cartId)
      if (existing) {
        return c.map(it => it.cartId === cartId ? { ...it, qty: Number(it.qty || 0) + qnum } : it)
      }
      const item = { ...p, qty: qnum || 1, cartId }
      return [...c, item]
    })
    setQuery('')
    setResults([])
    setSelectedIndex(-1)
    try { inputRef.current.focus() } catch (e) {}
  }

  // Cart editing helpers
  function updateCartItem(cartId, patch) {
    setCart(c => c.map(it => it.cartId === cartId ? { ...it, ...patch } : it))
  }
  function removeCartItem(cartId) {
    setCart(c => c.filter(it => it.cartId !== cartId))
  }

  // Create a local customer (temporary, client-side). In a real app you'd POST to /customers.
  async function createCustomer(name, phone, email) {
    // allow calling without args (use state)
    const nm = (name !== undefined) ? name : newCustomerName
    const ph = (phone !== undefined) ? phone : newCustomerPhone
    const em = (email !== undefined) ? email : newCustomerEmail
    if (!nm || !nm.trim()) return
    try {
      const r = await api.post('/customers', { name: nm.trim(), phone: ph || null, email: em || null })
      // ensure list updated and select newly created
      setCustomers(s => Array.isArray(s) ? [r.data, ...s] : [r.data])
      setSelectedCustomer(r.data.id)
      setShowCreateCustomer(false)
      setNewCustomerName('')
      setNewCustomerPhone('')
      setNewCustomerEmail('')
      try { window.dispatchEvent(new CustomEvent('customers:changed')) } catch (e) {}
    } catch (e) {
      console.error('create customer failed', e)
      import('../services/ui').then(m => m.showAlert('Failed to create customer'))
    }
  }

  // Totals
  function computeTotals() {
    // Items in cart show price inclusive of tax. Compute exclusive subtotal and tax total.
    let subtotal = 0
    let tax_total = 0
    let grand = 0
    for (const it of cart) {
      const qty = Number(it.qty) || 0
      const priceInclusive = Number(it.price) || 0
      const taxRate = (Number(it.tax_percent) || 0) / 100.0
      // exclusive price per unit = inclusive / (1 + taxRate)
      const unitExclusive = taxRate > 0 ? (priceInclusive / (1 + taxRate)) : priceInclusive
      const lineExclusive = qty * unitExclusive
      const lineTax = qty * (priceInclusive - unitExclusive)
      const lineInclusive = qty * priceInclusive
      subtotal += lineExclusive
      tax_total += lineTax
      grand += lineInclusive
    }
    // grand should equal subtotal + tax_total (allow minor rounding drift)
    return { subtotal, tax_total, grand }
  }

  // Payment modal state
  const [showPay, setShowPay] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [payMethod, setPayMethod] = useState('cash')
  const [cashGiven, setCashGiven] = useState('')
  const [applyLoyaltyPoints, setApplyLoyaltyPoints] = useState(0)
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

    // Send prices exclusive of tax to backend (backend expects price per unit before tax)
    const payload = {
      items: cart.map(it => {
        const taxRate = (Number(it.tax_percent) || 0) / 100.0
        const priceInclusive = Number(it.price) || 0
        const unitExclusive = taxRate > 0 ? (priceInclusive / (1 + taxRate)) : priceInclusive
        return ({ product_id: safeInt32(it.id), variant_id: it.variant_id || null, mrp: it.mrp != null ? Number(it.mrp) : null, sku: it.sku, name: it.name, qty: it.qty, price: Number(unitExclusive.toFixed(2)), tax_percent: it.tax_percent })
      }),
      payment_method: payMethod,
      payment_breakdown: { card: Number(cardAmount)||0, cash: Number(cashGiven)||0, upi: Number(upiAmount)||0, discount_percent: Number(discountPercent)||0, discount_rs: Number(discountRs)||0, loyalty_used: Number(applyLoyaltyPoints)||0, remarks: remarks || '' },
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
    // Compute totals with high precision and round only final totals for display.
    // Items passed to this function are expected to contain exclusive (pre-tax) unit prices.
    let subtotalExact = 0.0 // rupees, not rounded
    let taxExact = 0.0 // rupees, not rounded
    for (const it of items || []) {
      const qty = Number(it.qty) || 0
      const taxPct = (Number(it.tax_percent) || 0) / 100.0
      const priceExclusive = Number(it.price) || 0
      const lineExclusive = qty * priceExclusive
      const lineTax = lineExclusive * taxPct
      subtotalExact += lineExclusive
      taxExact += lineTax
    }
    // round totals only once for presentation
    const subtotal = Math.round(subtotalExact * 100) / 100
    const tax_total = Math.round(taxExact * 100) / 100
    const grand = Math.round((subtotalExact + taxExact) * 100) / 100

    // build rows showing per-line price as tax-inclusive unit rate (matches UI). Display values are rounded for readability.
    const rows = (items || []).map((it, i) => {
      const qty = Number(it.qty) || 0
      const taxPct = (Number(it.tax_percent) || 0) / 100.0
      const priceExclusive = Number(it.price) || 0
      const priceInclusiveUnit = priceExclusive * (1 + taxPct)
      const lineInclusive = qty * priceInclusiveUnit
      return `<tr><td>${i+1}</td><td>${it.sku||''}</td><td>${it.name}</td><td>${it.qty}</td><td>${formatCurrency(priceInclusiveUnit)}</td><td>${formatCurrency(lineInclusive)}</td></tr>`
    }).join('')

    const paymentLines = Object.entries(pb || {}).map(([k,v]) => `<div><strong>${k}</strong>: ${typeof v === 'number' ? formatCurrency(v) : v}</div>`).join('')

    // display grand as integer ceiling to match POS rounded display
    const grandRounded = Math.ceil(Number(grand) || 0)
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>@page{size:A3 landscape;margin:20mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse}th,td{padding:6px;border-bottom:1px solid #ddd;text-align:left}tfoot td{font-weight:700} .right{text-align:right}</style></head><body><h1>Receipt - Sale ${sale.id}</h1><div>${new Date().toLocaleString()}</div><table><thead><tr><th>#</th><th>SKU</th><th>Item</th><th>Qty</th><th>Price</th><th class="right">Line Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5">Subtotal</td><td class="right">${subtotal.toFixed(2)}</td></tr><tr><td colspan="5">Tax</td><td class="right">${tax_total.toFixed(2)}</td></tr><tr><td colspan="5">Grand Total</td><td class="right">${grandRounded}.00</td></tr></tfoot></table><h3>Payment</h3>${paymentLines}<div style="margin-top:20px">Thank you for your purchase.</div></body></html>`
  }

  function buildThermalReceiptHtml(sale, items, pb) {
    // compute totals from provided items (so printing works independently of cart)
    // Use high-precision accumulation and round only final totals for display.
    let subtotalExact = 0.0
    let taxExact = 0.0
    for (const it of items || []) {
      const qty = Number(it.qty) || 0
      const priceExclusive = Number(it.price) || 0
      const tax = (Number(it.tax_percent) || 0) / 100.0
      const lineExclusive = qty * priceExclusive
      subtotalExact += lineExclusive
      taxExact += lineExclusive * tax
    }
  const subtotal = Math.round(subtotalExact * 100) / 100
  const tax_total = Math.round(taxExact * 100) / 100
  const grand = Math.round((subtotalExact + taxExact) * 100) / 100
    const now = new Date()
    const invoiceNo = sale.id || ''
    const dateStr = now.toLocaleDateString()
    const timeStr = now.toLocaleTimeString()

    const rows = items.map((it, i) => {
      const name = (it.name || '').toUpperCase()
      const mrp = it.mrp != null ? Number(it.mrp) : ''
      const qty = Number(it.qty||0)
      const priceExclusive = Number(it.price||0)
      const taxPct = (Number(it.tax_percent) || 0) / 100.0
      // display per-line as tax-inclusive unit rate to match UI
      const rateInclusive = priceExclusive * (1 + taxPct)
      const totalInclusive = qty * rateInclusive
      return `<tr><td style="font-weight:700">${name}</td></tr><tr><td>${mrp ? formatCurrency(mrp) : ''} &nbsp; ${qty} x ${formatCurrency(rateInclusive, { minimumFractionDigits:0, maximumFractionDigits:0 })} &nbsp; ${formatCurrency(totalInclusive, { minimumFractionDigits:0, maximumFractionDigits:0 })}</td></tr>`
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
      <div>Sales <span class="right">${formatCurrency(Math.ceil(Number(grand) || 0))}</span></div>
      <div>Cash Received <span class="right">${formatCurrency(cash)}</span></div>
      <div class="sep"></div>
      <div class="center b">THANK YOU VISIT AGAIN</div>
    </body></html>`
  }

  // no mock add helper — use real products via search

  const totals = computeTotals()
  // totals.grand is computed as inclusive grand total (may be fractional). We display and use a rounded-up
  // integer value for Grand Total and Payable as requested by product.
  const totalAmount = totals.grand
  const totalAmountRounded = Math.ceil(Number(totalAmount) || 0)
  const dp = Number(discountPercent) || 0
  const calcDiscountRs = (dp/100) * totalAmount
  const drs = Number(discountRs) || calcDiscountRs || 0
  // loyalty application: applyLoyaltyPoints is points cashier wants to use (1 point = 1 Rs)
  const requestedLoyalty = Math.max(0, Number(applyLoyaltyPoints) || 0)
  const usableLoyalty = Math.max(0, Math.min(requestedLoyalty, Number(selectedCustomerLoyalty || 0)))
  const payableBase = Math.max(0, totalAmount - drs)
  // Payable should be rounded up to the next integer after applying discounts but before applying loyalty
  // then loyalty is subtracted and final payable is rounded up as well to an integer to match UI behavior.
  const payableBaseRounded = Math.ceil(payableBase)
  const payable = Math.max(0, Math.ceil(payableBaseRounded - usableLoyalty))
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
          {displayResults.length > 0 && (
            <div className="pos-results">
              {displayResults.map((dr, idx) => (
                <div key={(dr.item && dr.item.sku) || idx} className={`pos-result ${idx === selectedIndex ? 'selected' : ''}`} onClick={() => {
                    if (dr.group && dr.group.length > 1) setMrpPrompt({ group: dr.group, sku: String(dr.item.sku||''), value: '' })
                    else addProduct(dr.item)
                  }}>
                  <div className="r-sku">{dr.item.sku}</div>
                     <div className="r-name">{dr.item.name}</div>
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
                    <tr key={it.cartId}>
                      <td>{i+1}</td>
                      <td>{it.name}</td>
                      <td>
                        <input type="number" min="0" value={it.qty} onChange={e => updateCartItem(it.cartId, { qty: Number(e.target.value) })} className="small-input" />
                      </td>
                      <td>{it.mrp != null ? it.mrp : '-'}</td>
                      <td>{it.tax_percent}%</td>
                      <td>
                        <input type="number" min="0" step="0.01" value={it.price} onChange={e => updateCartItem(it.cartId, { price: Number(e.target.value) })} className="small-input" />
                      </td>
                      <td>{(Number(it.qty || 0) * Number(it.price || 0)).toFixed(2)}</td>
                      <td><button className="btn btn-ghost" onClick={() => removeCartItem(it.cartId)}>Remove</button></td>
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
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    placeholder="Customer (search name or phone)"
                    value={customerQuery}
                    onChange={e => {
                      const v = e.target.value
                      // clear any suppress flag when user edits
                      customerSuppressRef.current = false
                      setCustomerQuery(v)
                    }}
                    className="select-flex"
                  />
                  {/* suggestions dropdown */}
                  {customerSuggestions && customerSuggestions.length > 0 && (
                    <div className="pos-customer-suggestions" style={{ position: 'absolute', zIndex: 40, background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', width: '100%', maxHeight: 260, overflow: 'auto' }}>
                      <div key="none" className="pos-customer-suggestion" style={{ padding: 8, cursor: 'pointer' }} onMouseDown={() => {
                        customerSuppressRef.current = true
                        setSelectedCustomer(null)
                        setSelectedCustomerLoyalty(0)
                        setCustomerQuery('')
                        setCustomerSuggestions([])
                      }}>Walk-in / None</div>
                      {customerSuggestions.map(c => (
                        <div key={c.id} className="pos-customer-suggestion" style={{ padding: 8, cursor: 'pointer', borderTop: '1px solid #eee' }} onMouseDown={() => {
                          // suppress further suggestions until user types
                          customerSuppressRef.current = true
                          setSelectedCustomer(c.id)
                          setSelectedCustomerLoyalty(Number(c.loyalty_points || 0))
                          setCustomerQuery(`${c.name || ''}${c.phone ? ' (' + c.phone + ')' : ''}`)
                          setCustomerSuggestions([])
                        }}>
                          <div style={{ fontWeight: 600 }}>{c.name || 'Unnamed'}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{c.phone || ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost" onClick={() => setShowCreateCustomer(true)}>Create</button>
              </div>
            </div>

            <div className="pos-panel-card">
              <h3>Totals</h3>
              {cart.length === 0 && <div>No items</div>}
              {cart.length > 0 && (
                <div>
              <div>Subtotal (excl. tax): <strong>{totals.subtotal.toFixed(2)}</strong></div>
              <div>Tax: <strong>{totals.tax_total.toFixed(2)}</strong></div>
              <div style={{ marginTop: 8, fontSize: 18 }}>Grand Total (incl. tax): <strong>{totalAmountRounded}.00</strong></div>
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
                <div className="pm-total"><div>Total Amount (incl. tax)</div><div className="pm-amt">{totalAmountRounded}.00</div></div>
                <div className="pm-line discount-row"><div>Cash Discount %</div><div className="discount-controls"><input type="number" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} className="small-input" /><input type="number" value={discountRs} onChange={e => setDiscountRs(e.target.value)} className="small-input" placeholder="Rs" /></div></div>
                <div className="pm-line"><div>Loyalty</div><div><input type="number" value={loyalty} onChange={e => setLoyalty(e.target.value)} className="small-input" /></div></div>
                <div className="pm-line strong"><div>Payable Amount</div><div className="pm-amt">{payable}.00</div></div>
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

            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Loyalty Points</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div>Available: <strong>{selectedCustomerLoyalty} points</strong></div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>You can use up to {Math.min(selectedCustomerLoyalty, Math.floor(payableBase))} points for this sale.</div>
                </div>
                <div style={{ width: 180 }}>
                  <input type="number" min="0" max={selectedCustomerLoyalty} value={applyLoyaltyPoints} onChange={e => {
                    let v = Number(e.target.value || 0)
                    if (!Number.isFinite(v) || isNaN(v)) v = 0
                    // clamp to available loyalty and payableBase
                    v = Math.max(0, Math.min(v, Number(selectedCustomerLoyalty || 0), Math.floor(payableBase)))
                    setApplyLoyaltyPoints(v)
                  }} className="small-input" placeholder="Use points" />
                </div>
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

      {mrpPrompt && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            {/* Simplified: typed-only MRP input. Do not render clickable MRPs or an MRPs count here. */}
            <h3 style={{ marginBottom: 8 }}>Enter MRP for {mrpPrompt.sku} — {mrpPrompt.group && mrpPrompt.group[0] && mrpPrompt.group[0].name}</h3>
            <div>
              <label>Enter MRP</label>
              <input ref={mrpInputRef} type="text" inputMode="numeric" value={mrpPrompt.value} onChange={e => setMrpPrompt(s => ({ ...s, value: e.target.value, error: null }))} onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const valRaw = mrpPrompt.value == null ? '' : String(mrpPrompt.value)
                  const val = valRaw.replace(/,/g, '').trim()
                  if (!val) { setMrpPrompt(s => ({ ...s, error: 'Enter MRP' })); return }
                  const valNum = Number(val)
                  const match = mrpPrompt.group.find(p => {
                    const pmRaw = p.mrp == null ? '' : String(p.mrp).replace(/,/g, '').trim()
                    const pmNum = Number(pmRaw)
                    if (Number.isFinite(pmNum) && Number.isFinite(valNum)) {
                      // numeric comparison tolerant to trailing .00
                      return Math.abs(pmNum - valNum) < 0.0001
                    }
                    // fallback to exact string match
                    return pmRaw !== '' && pmRaw === val
                  })
                  if (match) {
                    addProduct(match, mrpPrompt && mrpPrompt.__qty ? mrpPrompt.__qty : 1)
                    setMrpPrompt(null)
                  } else {
                    setMrpPrompt(s => ({ ...s, error: 'No product with matching MRP found' }))
                  }
                }
              }} />
              {mrpPrompt.error ? <div style={{ color: 'var(--color-danger)', marginTop: 6 }}>{mrpPrompt.error}</div> : null}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn" onClick={() => {
                  const valRaw = mrpPrompt.value == null ? '' : String(mrpPrompt.value)
                  const val = valRaw.replace(/,/g, '').trim()
                  if (!val) { setMrpPrompt(s => ({ ...s, error: 'Enter MRP' })); return }
                  const valNum = Number(val)
                  const match = mrpPrompt.group.find(p => {
                    const pmRaw = p.mrp == null ? '' : String(p.mrp).replace(/,/g, '').trim()
                    const pmNum = Number(pmRaw)
                    if (Number.isFinite(pmNum) && Number.isFinite(valNum)) {
                      return Math.abs(pmNum - valNum) < 0.0001
                    }
                    return pmRaw !== '' && pmRaw === val
                  })
                  if (match) {
                    addProduct(match, mrpPrompt && mrpPrompt.__qty ? mrpPrompt.__qty : 1)
                    setMrpPrompt(null)
                  } else {
                    setMrpPrompt(s => ({ ...s, error: 'No product with matching MRP found' }))
                  }
                }}>OK</button>
                <button className="btn btn-ghost" onClick={() => setMrpPrompt(null)}>Cancel</button>
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
            <div className="field">
              <label className="field-label">Phone <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input type="tel" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} placeholder="Required" />
              {!newCustomerPhone || !String(newCustomerPhone).trim() ? <div style={{ color: 'var(--color-danger)', marginTop: 6 }}>Phone is required</div> : null}
            </div>
            <div className="field">
              <label className="field-label">Email</label>
              <input type="email" value={newCustomerEmail} onChange={e => setNewCustomerEmail(e.target.value)} placeholder="Optional" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => createCustomer()} disabled={!newCustomerName || !newCustomerName.trim() || !newCustomerPhone || !String(newCustomerPhone).trim()}>Create</button>
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
