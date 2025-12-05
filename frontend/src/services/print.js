// Shared print helpers - single consolidated implementation.
import api from './api'

// cache store settings per-store (keyed by store id or 'global')
let storeSettingsCache = {}

// load store settings; accepts optional storeId and optional forceReload flag
async function loadStoreSettings(storeId = null, force = false) {
  const key = storeId ? `store_${storeId}` : 'global'
  if (!force && storeSettingsCache && Object.prototype.hasOwnProperty.call(storeSettingsCache, key)) {
    return storeSettingsCache[key]
  }
  try {
    const url = storeId ? `/settings?store_id=${encodeURIComponent(storeId)}` : '/settings'
    const resp = await api.get(url).catch(() => null)
    const data = (resp && resp.data) ? resp.data : {}
    storeSettingsCache[key] = data
    return data
  } catch (e) {
    console.error('failed to load store settings', e)
    return storeSettingsCache[key] || {}
  }
}

export function clearStoreSettingsCache(storeId = null) {
  const key = storeId ? `store_${storeId}` : 'global'
  try { delete storeSettingsCache[key] } catch (e) { storeSettingsCache = {} }
}

function fmtINR(v, opts = {}) {
  return `₹ ${Number(v || 0).toLocaleString('en-IN', Object.assign({ minimumFractionDigits: 2, maximumFractionDigits: 2 }, opts))}`
}

export function buildThermalHtml(sale = {}, store = {}, payment_breakdown = {}, itemsOverride) {
  const items = Array.isArray(itemsOverride) ? itemsOverride : (sale.items || sale.sale_items || (sale.metadata && sale.metadata.items) || [])
    let subtotal = 0
    let tax_total = 0
    let mrp_total = 0
    const rows = (items || []).map(it => {
      const name = (it.name || '').toUpperCase()
      const qty = Number(it.qty || 0)
      const rate = Number(it.price || 0)
      const mrp = (it.mrp != null && it.mrp !== '') ? Number(it.mrp) : 0
      const lineRateTotal = qty * rate
      const lineMrpTotal = qty * mrp
      subtotal += lineRateTotal
      mrp_total += lineMrpTotal
      const tax = (Number(it.tax_percent) || 0) / 100.0
      tax_total += lineRateTotal * tax
      // Build discount label if product is marked as discounted
      let discountLabel = ''
      if (it.is_discounted) {
        const discount = Math.max(0, mrp - rate)
        const discountPct = mrp > 0 ? Math.round((discount / mrp) * 100) : 0
        if (discountPct > 0) {
          discountLabel = `<tr><td colspan="5" style="font-size:10px;padding-left:8px;color:#666;font-style:italic">⭐ OFFER: ${discountPct}% OFF</td></tr>`
        }
      }
      return `<tr><td style="font-weight:700">${name}</td><td style="text-align:right">${mrp ? fmtINR(mrp) : ''}</td><td style="text-align:center">${qty}</td><td style="text-align:right">${fmtINR((rate*(1+tax)).toFixed(2))}</td><td style="text-align:right">${fmtINR((lineRateTotal*(1+tax)).toFixed(2))}</td></tr>${discountLabel}`
    }).join('')

  const grand = subtotal + tax_total
    const savings = Math.max(0, (mrp_total - (subtotal*(1))))
  // Prefer sale.created_at when available for invoice timestamp
  const createdAt = sale && sale.created_at ? new Date(sale.created_at) : new Date()
  const invoiceNo = sale && sale.id ? `GCK${sale.id}` : ''
  const dateStr = createdAt.toLocaleDateString()
  const timeStr = createdAt.toLocaleTimeString()

  // store param takes precedence, then cached settings, then built-in fallback
  const s = (store && Object.keys(store).length) ? store : (storeSettingsCache || {})
  const fallback = {
    name: 'Store\nName',
    address: 'Address 1\naddress 2, City-000000',
    contact: '9876543210',
    gst: 'GSTIN: xxxxxxxxxx'
  }
  const merged = Object.assign({}, fallback, s)

  // allow different receipt templates
  const template = (merged && merged.pos && merged.pos.receipt && merged.pos.receipt.template) || (storeSettingsCache && storeSettingsCache.pos && storeSettingsCache.pos.receipt && storeSettingsCache.pos.receipt.template) || 'compact'

  // payment breakdown: prefer explicit arg, then sale.payment_breakdown or sale.metadata
  const pb = payment_breakdown || sale.payment_breakdown || sale.metadata || {}
  // customer info: merged fields or metadata
  const customerName = (sale.metadata && sale.metadata.customer_name) || sale.customer_name || ''
  const customerPhone = (sale.metadata && sale.metadata.customer_phone) || sale.customer_phone || ''
  const loyaltyUsed = (sale.metadata && (sale.metadata.loyalty_used || sale.metadata.loyalty_used === 0)) ? sale.metadata.loyalty_used : (sale.loyalty_used || 0)
  const loyaltyAwarded = (sale.metadata && (sale.metadata.loyalty_awarded || sale.metadata.loyalty_awarded === 0)) ? sale.metadata.loyalty_awarded : (sale.loyalty_awarded || 0)
  const previousCredit = (sale.metadata && (sale.metadata.previous_credit || sale.metadata.previous_credit === 0)) ? Number(sale.metadata.previous_credit || 0) : (Number(sale.previous_credit || 0) || 0)

  // Format GSTIN: prefix with label unless value already contains a GST label
  let gstHtml = ''
  try {
    if (merged && merged.gst) {
      const raw = String(merged.gst).trim()
      // if value already contains GST or GSTIN label (case-insensitive), reuse as-is
      if (/\bGST(?:IN)?\b[:\s]/i.test(raw) || /GSTIN/i.test(raw)) gstHtml = `<br/>${raw}`
      else gstHtml = `<br/>GSTIN: ${raw}`
    }
  } catch (e) { gstHtml = '' }

  const headerHtml = `<div class="center b" style="font-size:14px">${(merged.name || '').replace(/\n/g, '<br/>')}</div><div class="center small">${(merged.address || '').replace(/\n/g, '<br/>')}</div><div class="center small">${merged.contact ? ('Ph: ' + merged.contact) : ''}${gstHtml}</div>`

  // small invoice meta to show on compact/branded receipts
  // Invoice meta: left = invoice no, right = date/time on same line
  const invoiceMetaHtml = (invoiceNo || dateStr) ? `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-top:6px">
      <div style="text-align:left">${invoiceNo ? (`Invoice: ${invoiceNo}`) : ''}</div>
      <div style="text-align:right">${dateStr ? (`${dateStr} ${timeStr}`) : ''}</div>
    </div>` : ''

  const paymentSummary = () => {
    const parts = []
    try {
      // prefer explicit numeric values when present in payment_breakdown
      if (pb && typeof pb === 'object') {
        if (Object.prototype.hasOwnProperty.call(pb, 'cash') && Number(pb.cash)) parts.push(`Cash: ${fmtINR(pb.cash)}`)
        if (Object.prototype.hasOwnProperty.call(pb, 'card') && Number(pb.card)) parts.push(`Card: ${fmtINR(pb.card)}`)
        if (Object.prototype.hasOwnProperty.call(pb, 'upi') && Number(pb.upi)) parts.push(`UPI: ${fmtINR(pb.upi)}`)
        if (Object.prototype.hasOwnProperty.call(pb, 'credit') && Number(pb.credit)) parts.push(`Credit used: ${fmtINR(pb.credit)}`)
        if (Object.prototype.hasOwnProperty.call(pb, 'loyalty_used') && Number(pb.loyalty_used)) parts.push(`Loyalty used: ${Number(pb.loyalty_used)}`)
      }
    } catch (e) { /* ignore */ }
    return parts.length ? parts.join(' | ') : 'N/A'
  }

  // compact template
  if (template === 'compact') {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 2mm }
        body{ width:80mm; font-family: Arial, Helvetica, sans-serif; font-size:12px; color:#000; }
        .center{ text-align:center }
        .b { font-weight:700 }
        /* use a dashed divider for compact receipts for a lighter visual separation */
        .sep { border-top:1px dashed #000; margin:6px 0 }
        table{ width:100%; border-collapse:collapse; }
        td{ padding:2px 0 }
        .right{ text-align:right }
        .small{ font-size:11px }
      </style>
    </head><body>
  ${headerHtml}
  ${invoiceMetaHtml}
  <div class="sep"></div>
  ${customerName || customerPhone ? (`<div class="center b">Customer:</div><div class="center small">${customerName || ''}${customerPhone?('<br/>Phone : '+customerPhone):''}</div>`) : ''}
  ${previousCredit ? `<div style="text-align:center">Previous Credit: ${fmtINR(previousCredit)}</div>` : ''}
    <div class="sep"></div>
    <table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Item</th><th style="text-align:right">MRP</th><th style="text-align:center">QTY</th><th style="text-align:right">RATE</th><th style="text-align:right">TOTAL</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sep"></div>
      <div>Total Items: ${items.length}</div>
      <div><span style="font-weight:700">MRP Total:</span> ${fmtINR(mrp_total)}</div>
      <div style="margin-top:6px">
        <span style="font-weight:700">Savings:</span>
        <span style="font-weight:800;text-decoration:underline;margin-left:6px">${fmtINR(Math.max(0, mrp_total - subtotal))}</span>
      </div>
      <div class="b">Net Amount: ${fmtINR(grand)}</div>
  <div class="sep"></div>
      <div class="center small">Payment: ${paymentSummary()}</div>
      ${( (typeof loyaltyAwarded !== 'undefined' && loyaltyAwarded !== null && Number(loyaltyAwarded) !== 0) || (sale.metadata && (sale.metadata.loyalty_available || sale.metadata.loyalty_available === 0)) || (typeof loyaltyUsed !== 'undefined' && loyaltyUsed !== null && Number(loyaltyUsed) !== 0) ) ? `
        <div style="text-align:center;margin-top:4px">
          <div style="display:inline-block;text-align:left;min-width:180px">
            ${(typeof loyaltyAwarded !== 'undefined' && loyaltyAwarded !== null && Number(loyaltyAwarded) !== 0) ? `<div>Loyalty awarded: ${loyaltyAwarded}</div>` : ''}
            ${(sale.metadata && (sale.metadata.loyalty_available || sale.metadata.loyalty_available === 0)) ? `<div>Loyalty available: ${sale.metadata.loyalty_available}</div>` : ''}
            ${(typeof loyaltyUsed !== 'undefined' && loyaltyUsed !== null && Number(loyaltyUsed) !== 0) ? `<div>Loyalty used: ${loyaltyUsed}</div>` : ''}
          </div>
        </div>
      ` : ''}
  <div class="sep"></div>
  <div class="center b">THANK YOU</div>
    </body></html>`
  }

  // branded template
  if (template === 'branded') {
    // normalize logo url to absolute backend origin if needed
    let logoSrc = ''
    if (merged.logo_url) {
      const raw = String(merged.logo_url).trim()
      const normalized = raw.startsWith('/api/') ? raw.replace(/^\/api/, '') : raw
      const backendOrigin = (api.defaults && api.defaults.baseURL) ? api.defaults.baseURL.replace(/\/api\/?$/,'') : `${window.location.protocol}//${window.location.hostname}:4000`
      logoSrc = (normalized.startsWith('http') || normalized.startsWith('data:')) ? normalized : (backendOrigin + normalized)
    }

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
        .logo{ max-width:140px; max-height:60px; display:block; margin:0 auto 6px }
      </style>
    </head><body>
      ${(logoSrc) ? (`<div class="center"><img src="${logoSrc}" class="logo"/></div>`) : ''}
  ${headerHtml}
  ${invoiceMetaHtml}
  <div class="sep"></div>
      <table><tbody>${rows}</tbody></table>
      <div class="sep"></div>
      <div>Total Items: ${items.length}</div>
      <div class="b">Net Amount: ${fmtINR(grand)}</div>
      <div class="sep"></div>
      <div class="center small">${(merged.pos && merged.pos.receipt && merged.pos.receipt.footer_notes) || ''}</div>
    </body></html>`
  }

  // detailed template
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
    ${headerHtml}
    <div class="sep"></div>
    <div>Invoice No : ${invoiceNo}</div>
    <div>Invoice Date : ${dateStr} ${timeStr}</div>
    ${customerName || customerPhone ? (`<div>Details of Receiver(Billed to):<br/>${customerName}${customerPhone?('<br/>Phone : '+customerPhone):''}</div>`) : ''}
    <div class="sep"></div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr><th style="text-align:left">Item Name</th><th style="text-align:right">MRP</th><th style="text-align:center">QTY</th><th style="text-align:right">RATE</th><th style="text-align:right">TOTAL</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sep"></div>
    <div>Total Items: ${items.length}</div>
    <div>MRP Total: ${fmtINR(mrp_total)}</div>
    <div>Savings: ${fmtINR(Math.max(0, mrp_total - subtotal))}</div>
    <div class="b">Net Amount: ${fmtINR(grand)}</div>
    <div class="sep"></div>
    <table>
      <tr><td>Taxable</td><td class="right">${fmtINR(subtotal)}</td></tr>
      <tr><td>CGST</td><td class="right">${fmtINR(tax_total/2)}</td></tr>
      <tr><td>SGST</td><td class="right">${fmtINR(tax_total/2)}</td></tr>
    </table>
    <div class="sep"></div>
    <div>Old Balance: ${fmtINR(previousCredit)}</div>
    <div>Sales: ${fmtINR(grand)}</div>
    <div>Payment Received: ${fmtINR((pb && (Number(pb.cash||0)+Number(pb.card||0)+Number(pb.upi||0)+Number(pb.credit||0)+Number(pb.loyalty_used||0)))||0)}</div>
    <div>Balance: ${fmtINR((Number(previousCredit||0) + Number(grand||0) - (Number(pb && (Number(pb.cash||0)+Number(pb.card||0)+Number(pb.upi||0)+Number(pb.credit||0)+Number(pb.loyalty_used||0)))||0)))}</div>
    ${(typeof loyaltyAwarded !== 'undefined' && Number(loyaltyAwarded) > 0) ? `<div>Loyalty Points Earned: ${loyaltyAwarded}</div>` : ''}
    ${(sale.metadata && (sale.metadata.loyalty_available || sale.metadata.loyalty_available === 0)) ? `<div>Loyalty Points Available: ${sale.metadata.loyalty_available}</div>` : ''}
    ${(typeof loyaltyUsed !== 'undefined' && Number(loyaltyUsed) > 0) ? `<div>Loyalty Points Redeemed: ${loyaltyUsed}</div>` : ''}
    <div class="sep"></div>
    <div class="center b">THANK YOU VISIT AGAIN</div>
  </body></html>`
}

export function printThermal(saleOrPayload, itemsOrPb, maybePb) {
  (async () => {
    try {
      // normalize args: callers may pass (sale, payment_breakdown) or (sale, items, payment_breakdown)
      let sale = saleOrPayload || {}
      let items = null
      let pb = {}

      if (Array.isArray(itemsOrPb)) {
        items = itemsOrPb
        pb = maybePb || {}
      } else {
        pb = itemsOrPb || {}
      }

      // if caller passed payload (no sale id) but payload contains items/payment_breakdown
      if ((!sale || !sale.id) && saleOrPayload && Array.isArray(saleOrPayload.items)) {
        items = items || saleOrPayload.items
        pb = pb || saleOrPayload.payment_breakdown || saleOrPayload.metadata || {}
      }

      // attempt to load store-specific settings for this sale when possible
      // Derive store id from sale: allow numeric id in sale.store_id, sale.storeId,
      // or sale.store may be an object with an `id` property.
      let saleStoreId = null
      if (sale) {
        if (sale.store_id) saleStoreId = sale.store_id
        else if (sale.storeId) saleStoreId = sale.storeId
        else if (sale.store && typeof sale.store === 'object' && (sale.store.id || sale.store.id === 0)) saleStoreId = sale.store.id
        else if (sale.store && (typeof sale.store === 'number' || typeof sale.store === 'string')) saleStoreId = sale.store
      }
      if (saleStoreId !== null) saleStoreId = Number(saleStoreId)
      const store = await loadStoreSettings(saleStoreId)
      const html = buildThermalHtml(sale, store, pb, items)
      const w = window.open('', '_blank', 'width=400,height=600')
      if (!w) throw new Error('Popup blocked')
      w.document.write(html)
      w.document.close()
      w.onload = () => { try { w.focus(); w.print() } catch (e) { console.error(e) } }
    } catch (err) {
      console.error('print error', err)
      import('./ui').then(m => m.showAlert('Unable to open print window: ' + (err.message || err)))
    }
  })()
}

export function registerPrintHandlers() {
  if (typeof window === 'undefined') return
  window.window_printthermal = (sale, pb) => printThermal(sale, pb)
  window.printThermal = (sale, pb) => printThermal(sale, pb)
  window.__printThermal = (sale, pb) => printThermal(sale, pb)
}

export default { buildThermalHtml, printThermal, registerPrintHandlers }
