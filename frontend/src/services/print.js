// Shared print helpers. Exposes a thermal print function and registers global aliases.
import api from './api'

let storeSettingsCache = null

async function loadStoreSettings() {
  if (storeSettingsCache) return storeSettingsCache
  try {
    const resp = await api.get('/settings').catch(() => null)
    if (resp && resp.data) storeSettingsCache = resp.data
  } catch (e) {
    console.error('failed to load store settings', e)
  }
  return storeSettingsCache
}

export function buildThermalHtml(sale, store) {
  const items = sale.items || sale.sale_items || (sale.metadata && sale.metadata.items) || []
  let subtotal = 0
  let tax_total = 0
  const rows = items.map(it => {
    const name = (it.name || '').toUpperCase()
    const qty = Number(it.qty || 0)
    const rate = Number(it.price || 0)
    const total = qty * rate
    subtotal += total
    const tax = (Number(it.tax_percent) || 0) / 100.0
    tax_total += total * tax
    const fmt = (v, opts) => `₹ ${Number(v).toLocaleString('en-IN', Object.assign({ minimumFractionDigits: 2, maximumFractionDigits: 2 }, opts))}`
    return `<tr><td style="font-weight:700">${name}</td></tr><tr><td>${qty} x ${fmt(rate)} = ${fmt(total)}</td></tr>`
  }).join('')
  const grand = subtotal + tax_total
  const now = new Date()
  const invoiceNo = sale.id || ''
  const dateStr = now.toLocaleDateString()
  const timeStr = now.toLocaleTimeString()
  // store param takes precedence, then cached settings, then built-in fallback
  const s = store || storeSettingsCache || { name: 'GROCA\nKUNDAMANKADAV', address: 'Ground Floor, Devi Arcade,\nkundamankadavu, Trivandrum-695013', contact: 'Ph: 9567171729', gst: 'GSTIN: 32AALCG0917G1ZW' }
  // allow different receipt templates
  const template = (s && s.pos && s.pos.receipt && s.pos.receipt.template) || (storeSettingsCache && storeSettingsCache.pos && storeSettingsCache.pos.receipt && storeSettingsCache.pos.receipt.template) || 'compact'

  if (template === 'compact') {
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
    <div class="center b" style="font-size:14px">${(s.name || '').replace(/\n/g, '<br/>')}</div>
    <div class="center small">${(s.contact ? ('Ph: ' + s.contact) : '')}</div>
      <div class="sep"></div>
      <table><tbody>${rows}</tbody></table>
      <div class="sep"></div>
    <div class="b">Net Amount: ₹ ${Number(grand).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="sep"></div>
      <div class="center b">THANK YOU</div>
    </body></html>`
  }

  if (template === 'branded') {
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
    ${(s.logo_url) ? (`<div class="center"><img src="${s.logo_url}" class="logo"/></div>`) : ''}
    <div class="center b" style="font-size:14px">${(s.name || '').replace(/\n/g, '<br/>')}</div>
    <div class="center small">${(s.address || '').replace(/\n/g, '<br/>')}</div>
    <div class="sep"></div>
    <table><tbody>${rows}</tbody></table>
    <div class="sep"></div>
  <div>Total Items: ${items.length}</div>
  <div class="b">Net Amount: ₹ ${Number(grand).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    <div class="sep"></div>
    <div class="center small">${(s.pos && s.pos.receipt && s.pos.receipt.footer_notes) || ''}</div>
    </body></html>`
  }

  // detailed
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
  <div class="center b" style="font-size:14px">${(s.name || '').replace(/\n/g, '<br/>')}</div>
  <div class="center small">${(s.address || '').replace(/\n/g, '<br/>')}</div>
  <div class="center small">${(s.contact ? ('Ph: ' + s.contact) : '')}${s.gst ? ('<br/>' + s.gst) : ''}</div>
    <div class="sep"></div>
    <div>Invoice No : ${invoiceNo}</div>
    <div>Invoice Date : ${dateStr} ${timeStr}</div>
    <div class="sep"></div>
    <table><tbody>${rows}</tbody></table>
    <div class="sep"></div>
  <div>Total Items: ${items.length}</div>
  <div>Mrp Total: ₹ ${Number(subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
  <div class="b">Net Amount: ₹ ${Number(grand).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    <div class="sep"></div>
    <table>
  <tr><td>Taxable</td><td class="right">₹ ${Number(subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
  <tr><td>CGST</td><td class="right">₹ ${Number(tax_total/2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
  <tr><td>SGST</td><td class="right">₹ ${Number(tax_total/2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
    </table>
    <div class="sep"></div>
    <div class="center b">THANK YOU VISIT AGAIN</div>
  </body></html>`
}

export function printThermal(sale) {
  try {
    // ensure store settings are loaded
    (async () => {
      try {
        const store = await loadStoreSettings()
        const html = buildThermalHtml(sale, store)
        const w = window.open('', '_blank', 'width=400,height=600')
        if (!w) throw new Error('Popup blocked')
        w.document.write(html)
        w.document.close()
        w.onload = () => { try { w.focus(); w.print() } catch (e) { console.error(e) } }
      } catch (err) { console.error('print error', err); import('./ui').then(m => m.showAlert('Unable to open print window: ' + (err.message || err))) }
    })()
  } catch (e) { console.error('printThermal error', e); import('./ui').then(m => m.showAlert('Unable to open print window: ' + (e.message || e))) }
}

export function registerPrintHandlers() {
  if (typeof window === 'undefined') return
  window.window_printthermal = (sale) => printThermal(sale)
  window.printThermal = (sale) => printThermal(sale)
  window.__printThermal = (sale) => printThermal(sale)
}

export default { buildThermalHtml, printThermal, registerPrintHandlers }
