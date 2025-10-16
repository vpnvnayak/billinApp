import React, { useEffect, useState, useRef } from 'react'
import api from '../../services/api'
import * as ui from '../../services/ui'
import printService from '../../services/print'

const tabs = ['Payment Methods', 'Receipt Template', 'Tax Rules', 'Hardware Setup', 'Transaction Defaults']

export default function POSConfig() {
  const [active, setActive] = useState(tabs[0])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pos, setPos] = useState({
    payment_methods: { cash: true, card: true, digital_wallets: false },
    receipt: { header_logo: null, footer_notes: '' },
    hardware: {},
    defaults: {}
  })
  const fileRef = useRef()
  const [logoPreview, setLogoPreview] = useState(null)
  const tabsRef = useRef(null)
  const activeRef = useRef(null)
  const underlineRef = useRef(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewIframeRef = useRef(null)

  useEffect(() => { load() }, [])
  useEffect(() => {
    // position underline immediately on active change and keep it updated
    positionUnderline()
    window.addEventListener('resize', positionUnderline)
    const el = tabsRef.current
    const onScroll = () => positionUnderline()
    if (el) el.addEventListener('scroll', onScroll)

    let ro = null
    try {
      if (window.ResizeObserver) {
        ro = new ResizeObserver(positionUnderline)
        if (el) ro.observe(el)
      }
    } catch (e) {
      // Ignore if ResizeObserver not supported
    }

    return () => {
      window.removeEventListener('resize', positionUnderline)
      if (el) el.removeEventListener('scroll', onScroll)
      if (ro) ro.disconnect()
    }
  }, [active])

  function positionUnderline() {
    try {
      if (!tabsRef.current || !underlineRef.current) return
      const buttons = Array.from(tabsRef.current.querySelectorAll('button'))
      const idx = tabs.findIndex(t => t === active)
      const btn = buttons[idx]
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const parentRect = tabsRef.current.getBoundingClientRect()
      const left = rect.left - parentRect.left + tabsRef.current.scrollLeft
      underlineRef.current.style.transform = `translateX(${left}px)`
      underlineRef.current.style.width = `${rect.width}px`
  // subtle thickness pulse when moving
  underlineRef.current.style.height = '4px'
  setTimeout(() => { if (underlineRef.current) underlineRef.current.style.height = '2px' }, 220)
    } catch (e) {
      // ignore
    }
  }

  async function load() {
    setLoading(true)
    try {
      const r = await api.get('/settings').catch(() => null)
      if (r && r.data) {
        const s = r.data
        setPos(p => ({
          ...p,
          ...(s.pos || {}),
          receipt: {
            ...(p.receipt || {}),
            ...(s.pos && s.pos.receipt ? s.pos.receipt : {})
          }
        }))
        // logo handling: if pos.receipt.header_logo is a relative url, prefix backend origin
        const headerLogo = (s.pos && s.pos.receipt && s.pos.receipt.header_logo) || null
        if (headerLogo) {
          try {
            const backendOrigin = (api.defaults && api.defaults.baseURL) ? api.defaults.baseURL.replace(/\/api\/?$/,'') : `${window.location.protocol}//${window.location.hostname}:4000`
            const full = headerLogo.startsWith('http') ? headerLogo : (backendOrigin + headerLogo)
            setLogoPreview(full)
          } catch (e) {
            setLogoPreview(headerLogo)
          }
        }
      }
    } catch (e) {
      console.error('load pos settings failed', e)
    } finally { setLoading(false) }
  }

  function setField(path, val) {
    // simple path setter for pos object like 'receipt.footer_notes' or 'payment_methods.cash'
    setPos(prev => {
      const copy = JSON.parse(JSON.stringify(prev))
      const parts = path.split('.')
      let cur = copy
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]]) cur[parts[i]] = {}
        cur = cur[parts[i]]
      }
      cur[parts[parts.length - 1]] = val
      return copy
    })
  }

  function toggleMethod(k) { setField(`payment_methods.${k}`, !pos.payment_methods[k]) }

  function handleFile(e) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setLogoPreview(URL.createObjectURL(f))
  }

  async function handleSave() {
    setSaving(true)
    try {
      // handle header logo upload if a file selected
      let headerUrl = null
      const file = fileRef.current && fileRef.current.files && fileRef.current.files[0]
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        const up = await api.post('/uploads/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => null)
        if (up && up.data && up.data.url) headerUrl = up.data.url
      }

      const payload = { pos: { ...pos } }
      if (headerUrl) payload.pos = { ...(payload.pos || {}), receipt: { ...(payload.pos.receipt || {}), header_logo: headerUrl } }

      const r = await api.post('/settings', payload).catch(() => null)
      if (r && r.data) {
        ui.showSnackbar('POS settings saved', 'success')
        // reflect any stored header logo
        const newHeader = r.data.pos && r.data.pos.receipt && r.data.pos.receipt.header_logo
        if (newHeader) {
          const backendOrigin = (api.defaults && api.defaults.baseURL) ? api.defaults.baseURL.replace(/\/api\/?$/,'') : `${window.location.protocol}//${window.location.hostname}:4000`
          const full = newHeader.startsWith('http') ? newHeader : (backendOrigin + newHeader)
          setLogoPreview(full)
        }
      } else {
        ui.showAlert('Saved locally (backend may be missing).')
      }
    } catch (e) {
      console.error('save pos failed', e)
      ui.showAlert('Failed to save POS settings')
    } finally { setSaving(false) }
  }

  return (
  <div style={{ fontFamily: "'Outfit', Inter, 'Segoe UI', Roboto, Arial, Helvetica, sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>POS Configuration</h3>
        <div>
          <button className="btn btn-ghost" style={{ marginRight: 8 }}>Test configurations</button>
          <button className="btn btn-ghost">Reset all</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          {/* Sticky horizontal tab bar */}
          <div style={{ position: 'sticky', top: 12, zIndex: 30, background: 'var(--app-bg)', padding: '8px 0', marginBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
            <div ref={tabsRef} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '6px 4px' }}>
                {tabs.map(t => (
                  <button
                    key={t}
                    onClick={() => setActive(t)}
                    className={t === active ? 'btn btn-ghost active' : 'btn btn-ghost'}
                    style={{ whiteSpace: 'nowrap', color: t === active ? 'var(--accent)' : undefined, fontWeight: t === active ? 600 : 500 }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div ref={underlineRef} style={{ height: 2, background: 'var(--accent)', position: 'absolute', bottom: 0, left: 0, width: 0, transform: 'translateX(0)', transition: 'transform 220ms cubic-bezier(.2,.9,.2,1), width 220ms cubic-bezier(.2,.9,.2,1)' }} />
            </div>
          </div>
          {active === 'Payment Methods' && (
            <div>
              <h4>Payment Methods</h4>
              <p style={{ color: 'var(--color-muted)' }}>Configure accepted payment types</p>
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1, padding: 12, borderRadius: 8, background: 'var(--color-bg)', boxShadow: 'var(--card-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#ecf9f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💵</div>
                    <div>Cash</div>
                  </div>
                  <label className="lc-toggle">
                    <input type="checkbox" checked={pos.payment_methods.cash} onChange={() => toggleMethod('cash')} />
                  </label>
                </div>

                <div style={{ flex: 1, padding: 12, borderRadius: 8, background: 'var(--color-bg)', boxShadow: 'var(--card-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eef6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💳</div>
                    <div>Card</div>
                  </div>
                  <label className="lc-toggle">
                    <input type="checkbox" checked={pos.payment_methods.card} onChange={() => toggleMethod('card')} />
                  </label>
                </div>

                <div style={{ flex: 1, padding: 12, borderRadius: 8, background: 'var(--color-bg)', boxShadow: 'var(--card-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fff4ec', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📱</div>
                    <div>Digital wallets</div>
                  </div>
                  <label className="lc-toggle">
                    <input type="checkbox" checked={pos.payment_methods.digital_wallets} onChange={() => toggleMethod('digital_wallets')} />
                  </label>
                </div>
              </div>
            </div>
          )}

          {active === 'Receipt Template' && (
            <div>
              <h4>Receipt Template</h4>
              <p style={{ color: 'var(--color-muted)' }}>Customize receipt templates, including store logo and footer notes</p>
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Header logo (Optional)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 140, height: 80, borderRadius: 8, background: '#f7f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {logoPreview ? <img src={logoPreview} alt="header" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <div style={{ color: 'var(--color-muted)' }}>No logo</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} />
                    <div style={{ color: 'var(--color-muted)', marginTop: 8 }}>PNG, JPG, SVG (recommended)</div>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="field-label">Receipt design</label>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    {[{ id: 'compact', title: 'Compact' }, { id: 'branded', title: 'Branded' }, { id: 'detailed', title: 'Detailed' }].map(opt => (
                      <label key={opt.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: opt.id === (pos.receipt && pos.receipt.template) ? '1px solid var(--color-primary)' : '1px solid var(--color-border)', background: '#fff', cursor: 'pointer', minWidth: 160 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700 }}>{opt.title}</div>
                          <input type="radio" name="receipt_template" checked={pos.receipt && pos.receipt.template === opt.id} onChange={() => setField('receipt.template', opt.id)} />
                        </div>
                        <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>
                          {opt.id === 'compact' && 'Minimal compact layout for thermal printers.'}
                          {opt.id === 'branded' && 'Centered logo and store information.'}
                          {opt.id === 'detailed' && 'Full itemized receipt with tax breakdown.'}
                        </div>
                      </label>
                    ))}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label className="field-label">Footer notes</label>
                    <textarea className="input" value={pos.receipt.footer_notes || ''} onChange={e => setField('receipt.footer_notes', e.target.value)} style={{ minHeight: 100 }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {active === 'Tax Rules' && (
            <div>
              <h4>Tax Rules</h4>
              <p style={{ color: 'var(--color-muted)' }}>Configure tax behavior for the POS</p>
              <div style={{ marginTop: 12 }}>
                <div className="field">
                  <label className="field-label">Default tax rate (%)</label>
                  <input className="input" type="number" value={pos.tax_rate || ''} onChange={e => setField('tax_rate', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {active === 'Hardware Setup' && (
            <div>
              <h4>Hardware Setup</h4>
              <p style={{ color: 'var(--color-muted)' }}>Configure card readers, receipt printers and barcode scanners</p>
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Receipt printer</label>
                <select className="input">
                  <option>Default printer</option>
                </select>
              </div>
            </div>
          )}

          {active === 'Transaction Defaults' && (
            <div>
              <h4>Transaction Defaults</h4>
              <p style={{ color: 'var(--color-muted)' }}>Default payment method and transaction behavior</p>
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Default payment</label>
                <select className="input" value={pos.defaults.default_payment || ''} onChange={e => setField('defaults.default_payment', e.target.value)}>
                  <option value="">(none)</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="digital_wallets">Digital wallets</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ marginTop: 18 }} className="row-end">
            <button className="btn btn-ghost" onClick={load} disabled={loading}>Reload</button>
            {active === 'Receipt Template' && (
              <button className="btn btn-ghost" onClick={() => {
                try {
                  // open modal and inject HTML into iframe. Prefer live logoPreview if present
                  const sample = { items: [{ name: 'Sample Item', qty: 2, price: 49.99, tax_percent: 5 }] }
                  const storeArg = { ...pos }
                  // if we have a local unsaved object URL for logo, ensure the receipt template uses it
                  if (logoPreview) {
                    // massage storeArg so that buildThermalHtml will use the inline preview URL as logo
                    storeArg.logo_url = logoPreview
                    if (!storeArg.pos) storeArg.pos = { receipt: {} }
                    if (!storeArg.pos.receipt) storeArg.pos.receipt = {}
                    storeArg.pos.receipt.header_logo = logoPreview
                  }
                  const html = printService.buildThermalHtml(sample, storeArg)
                  setPreviewOpen(true)
                  // inject html into iframe after modal opens
                  setTimeout(() => {
                    try {
                      const ifr = previewIframeRef.current
                      if (ifr && ifr.contentWindow) {
                        ifr.contentWindow.document.open()
                        ifr.contentWindow.document.write(html)
                        ifr.contentWindow.document.close()
                      }
                    } catch (e) { console.error('inject preview failed', e) }
                  }, 50)
                } catch (e) { console.error('preview failed', e); ui.showAlert('Preview failed: ' + (e.message || e)) }
              }} style={{ marginLeft: 8 }}>Preview</button>
            )}
            <button className="btn" onClick={handleSave} disabled={saving} style={{ marginLeft: 8 }}>{saving ? 'Saving…' : 'Save POS'}</button>
          </div>
        </div>
        </div>

        {/* Preview modal (in-app) */}
        {previewOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }} onClick={() => setPreviewOpen(false)}>
            <div style={{ width: 460, height: 720, background: 'var(--app-bg)', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: 10, borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700 }}>Receipt preview</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => {
                    try {
                      // Use printService to build the exact HTML used for printing
                      const sample = { items: [{ name: 'Sample Item', qty: 2, price: 49.99, tax_percent: 5 }] }
                      const storeForPrint = { ...(pos || {}) }
                      if (logoPreview) {
                        if (!storeForPrint.pos) storeForPrint.pos = { receipt: {} }
                        if (!storeForPrint.pos.receipt) storeForPrint.pos.receipt = {}
                        storeForPrint.pos.receipt.header_logo = logoPreview
                      }
                      const html = printService.buildThermalHtml(sample, storeForPrint)
                      const w = window.open('', '_blank', 'width=400,height=600')
                      if (!w) { ui.showAlert('Unable to open print window (popup blocked)') ; return }
                      w.document.write(html)
                      w.document.close()
                      w.onload = () => { try { w.focus(); w.print() } catch (e) { console.error(e) } }
                    } catch (e) { console.error('print preview failed', e); ui.showAlert('Print failed: ' + (e.message || e)) }
                  }}>Print</button>
                  <button className="btn" onClick={() => setPreviewOpen(false)}>Close</button>
                </div>
              </div>
              <div style={{ flex: 1, background: '#fff', padding: 12, overflow: 'auto' }}>
                {/* React-rendered preview (mirrors templates in print.js) */}
                {(() => {
                  const sampleItems = [{ name: 'Sample Item', qty: 2, price: 49.99, tax_percent: 5 }]
                  const items = sampleItems
                  let subtotal = 0; let tax_total = 0
                  const rows = items.map((it, idx) => {
                    const name = (it.name || '').toUpperCase()
                    const qty = Number(it.qty || 0)
                    const rate = Number(it.price || 0)
                    const total = qty * rate
                    subtotal += total
                    const tax = (Number(it.tax_percent) || 0) / 100.0
                    tax_total += total * tax
                    return (
                      <div key={idx} style={{ paddingBottom: 6 }}>
                        <div style={{ fontWeight: 700 }}>{name}</div>
                        <div style={{ color: 'var(--color-muted)' }}>{qty} x ₹ {rate.toFixed(2)} = ₹ {total.toFixed(2)}</div>
                      </div>
                    )
                  })
                  const grand = subtotal + tax_total
                  const template = (pos && pos.receipt && pos.receipt.template) || 'compact'
                  const storeName = (pos && pos.store_name) || 'STORE NAME'
                  const storeAddress = (pos && pos.store_address) || ''
                  const storeContact = (pos && pos.store_contact) || ''
                  const gst = (pos && pos.gst) || ''
                  const headerLogo = logoPreview || (pos && pos.receipt && pos.receipt.header_logo) || null

                  if (template === 'compact') {
                    return (
                      <div style={{ width: '100%', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12 }}>
                        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, whiteSpace: 'pre-wrap' }}>{storeName}</div>
                        <div style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{storeContact}</div>
                        <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                        <div>{rows}</div>
                        <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                        <div style={{ fontWeight: 700 }}>Net Amount: ₹ {grand.toFixed(2)}</div>
                        <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                        <div style={{ textAlign: 'center', fontWeight: 700 }}>THANK YOU</div>
                      </div>
                    )
                  }

                  if (template === 'branded') {
                    return (
                      <div style={{ width: '100%', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12 }}>
                        {headerLogo ? <div style={{ textAlign: 'center', marginBottom: 6 }}><img src={headerLogo} alt="logo" style={{ maxWidth: 140, maxHeight: 60 }} /></div> : null}
                        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, whiteSpace: 'pre-wrap' }}>{storeName}</div>
                        <div style={{ textAlign: 'center', color: 'var(--color-muted)', whiteSpace: 'pre-wrap' }}>{storeAddress}</div>
                        <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                        <div>{rows}</div>
                        <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                        <div>Total Items: {items.length}</div>
                        <div style={{ fontWeight: 700 }}>Net Amount: ₹ {grand.toFixed(2)}</div>
                        <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                        <div style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{(pos && pos.receipt && pos.receipt.footer_notes) || ''}</div>
                      </div>
                    )
                  }

                  // detailed
                  return (
                    <div style={{ width: '100%', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12 }}>
                      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, whiteSpace: 'pre-wrap' }}>{storeName}</div>
                      <div style={{ textAlign: 'center', color: 'var(--color-muted)', whiteSpace: 'pre-wrap' }}>{storeAddress}</div>
                      <div style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{(storeContact ? ('Ph: ' + storeContact) : '')}{gst ? ('\n' + gst) : ''}</div>
                      <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                      <div style={{ color: 'var(--color-muted)' }}>Invoice No : </div>
                      <div style={{ color: 'var(--color-muted)' }}>Invoice Date : </div>
                      <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                      <div>{rows}</div>
                      <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                      <div>Total Items: {items.length}</div>
                      <div>Mrp Total: ₹ {subtotal.toFixed(2)}</div>
                      <div style={{ fontWeight: 700 }}>Net Amount: ₹ {grand.toFixed(2)}</div>
                      <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                      <div style={{ textAlign: 'center', fontWeight: 700 }}>THANK YOU VISIT AGAIN</div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
  )
}
