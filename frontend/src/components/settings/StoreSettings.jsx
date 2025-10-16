import React, { useEffect, useState, useRef } from 'react'
import api from '../../services/api'
import * as ui from '../../services/ui'

// Business hours removed per request

export default function StoreSettings() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  const [ifscLoading, setIfscLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    address: '',
    contact: '',
    gst_id: '',
  bank_name: '',
  bank_branch: '',
  account_no: '',
  ifsc: '',
  account_name: '',
    website: '',
    tax_rate: 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  })
  const fileRef = useRef()

  useEffect(() => { load() }, [])
  useEffect(() => {
    function onNav(e) {
      const to = e?.detail || window.location.pathname
      if (to && (to === '/settings' || to.startsWith('/settings/store'))) {
        load()
      }
    }
    window.addEventListener('navigate', onNav)
    window.addEventListener('popstate', onNav)
    return () => { window.removeEventListener('navigate', onNav); window.removeEventListener('popstate', onNav) }
  }, [])

  async function load() {
    setLoading(true)
    try {
      const resp = await api.get('/settings').catch(() => null)
      if (resp && resp.data) {
        const s = resp.data
        setForm({
          name: s.name || '',
          address: s.address || '',
          contact: s.contact || '',
          website: s.website || '',
          tax_rate: s.tax_rate || 0,
          timezone: s.timezone || form.timezone,
          gst_id: s.gst_id || '',
          bank_name: s.bank_name || '',
          bank_branch: s.bank_branch || '',
          account_no: s.account_no || '',
          ifsc: s.ifsc || '',
          account_name: s.account_name || ''
        })
        if (s.logo_url) {
          // Ensure logo URL points to backend origin (not frontend origin)
          try {
            const backendOrigin = (api.defaults && api.defaults.baseURL) ? api.defaults.baseURL.replace(/\/api\/?$/,'') : `${window.location.protocol}//${window.location.hostname}:4000`
            const full = s.logo_url.startsWith('http') ? s.logo_url : (backendOrigin + s.logo_url)
            setLogoPreview(full)
          } catch (e) {
            setLogoPreview(s.logo_url)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load settings', err)
      ui.showAlert('Failed to load settings (backend may not implement /settings)')
    } finally { setLoading(false) }
  }

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleFile(e) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setLogoPreview(URL.createObjectURL(f))
  }

  async function handleIfscBlur() {
    const code = (form.ifsc || '').trim()
    if (!code) return
    setIfscLoading(true)
    try {
      const r = await api.get(`/ifsc/${encodeURIComponent(code)}`).catch(() => null)
      if (r && r.data) {
        const d = r.data
        // populate bank name and branch if available
        if (d.bank) setField('bank_name', d.bank)
        if (d.branch) setField('bank_branch', d.branch)
      }
    } catch (e) {
      console.error('IFSC lookup failed', e)
    } finally {
      setIfscLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      // try upload if a file selected
      let logoUrl = null
      const file = fileRef.current && fileRef.current.files && fileRef.current.files[0]
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        const up = await api.post('/uploads/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => null)
        if (up && up.data && up.data.url) logoUrl = up.data.url
      }

      const payload = { ...form }
      if (logoUrl) payload.logo_url = logoUrl

      const r = await api.post('/settings', payload).catch(() => null)
      if (r && r.data) {
        // update UI with server's merged settings
        setForm(f => ({ ...f, ...r.data }))
        if (r.data.logo_url) {
          const backendOrigin = (api.defaults && api.defaults.baseURL) ? api.defaults.baseURL.replace(/\/api\/?$/,'') : `${window.location.protocol}//${window.location.hostname}:4000`
          const full = r.data.logo_url.startsWith('http') ? r.data.logo_url : (backendOrigin + r.data.logo_url)
          setLogoPreview(full)
        }
        ui.showSnackbar('Settings saved', 'success')
      } else {
        ui.showAlert('Saved locally (backend endpoint may be missing).')
      }
    } catch (err) {
      console.error('save settings failed', err)
      ui.showAlert('Failed to save settings')
    } finally { setSaving(false) }
  }

  function toggleDay(idx) {
    setForm(f => {
      return f
    })
  }

  // Convert 24-hour HH:MM to { hh: '09:00', ampm: 'AM' } style parts
  function toDisplayParts(hhmm) {
    return { hh: '09:00', ampm: 'AM' }
  }

  function to24Hour(parts) {
    // parts = { hh: '09:00', ampm: 'AM' }
    return '09:00'
  }

  function setDayTime(idx, key, val) {
    // key will be 'from' or 'to' but val may be subparts
    return
  }

  return (
    <div>
      <h3>Store settings</h3>
      {loading ? <div>Loading…</div> : null}
  <p>Configure store name, address and tax.</p>
      <div style={{ maxWidth: 920 }}>

        <div className="field">
          <label className="field-label">Company logo</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 96, height: 96, borderRadius: 8, background: '#f7f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {logoPreview ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ color: 'var(--color-muted)' }}>No logo</div>}
            </div>
            <div style={{ flex: 1 }}>
              <input ref={fileRef} onChange={handleFile} type="file" accept="image/*" />
              <div style={{ color: 'var(--color-muted)', marginTop: 8 }}>PNG, JPG, SVG (recommended 800x400px)</div>
            </div>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Store name</label>
          <input value={form.name} onChange={e => setField('name', e.target.value)} className="input" />
        </div>

        <div className="field">
          <label className="field-label">Address</label>
          <textarea value={form.address} onChange={e => setField('address', e.target.value)} className="input" />
        </div>

        <div className="row">
          <div style={{ flex: 1 }} className="field">
            <label className="field-label">Contact info</label>
            <input value={form.contact} onChange={e => setField('contact', e.target.value)} className="input" />
          </div>
          <div style={{ width: 260 }} className="field">
            <label className="field-label">Website</label>
            <input value={form.website} onChange={e => setField('website', e.target.value)} className="input" />
          </div>
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ flex: 1 }} className="field">
            <label className="field-label">GST ID</label>
            <input value={form.gst_id} onChange={e => setField('gst_id', e.target.value)} className="input" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div className="field">
            <label className="field-label">Account no.</label>
            <input value={form.account_no || ''} onChange={e => setField('account_no', e.target.value)} className="input" />
          </div>

          <div className="field" style={{ position: 'relative' }}>
            <label className="field-label">IFSC</label>
            <input value={form.ifsc || ''} onChange={e => setField('ifsc', e.target.value)} onBlur={handleIfscBlur} className="input" />
            {ifscLoading && (
              <div style={{ position: 'absolute', right: 12, top: 36 }}>
                <svg width="18" height="18" viewBox="0 0 50 50">
                  <circle cx="25" cy="25" r="20" fill="none" stroke="var(--accent)" strokeWidth="4" strokeDasharray="90" strokeDashoffset="0">
                    <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                  </circle>
                </svg>
              </div>
            )}
          </div>

          <div className="field">
            <label className="field-label">Account name</label>
            <input value={form.account_name || ''} onChange={e => setField('account_name', e.target.value)} className="input" />
          </div>

          <div className="field">
            <label className="field-label">Branch</label>
            <input value={form.bank_branch || ''} readOnly className="input" style={{ background: '#fafafa', cursor: 'not-allowed' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 8 }}>
          <div className="field">
            <label className="field-label">Bank Name</label>
            <input value={form.bank_name || ''} readOnly className="input" style={{ background: '#fafafa', cursor: 'not-allowed' }} />
          </div>
        </div>

        
        <hr style={{ margin: '18px 0' }} />

        {/* Business hours UI removed */}

        <div style={{ marginTop: 18 }} className="row-end">
          <button className="btn btn-ghost" onClick={load} disabled={loading}>Reload</button>
          <button className="btn" onClick={handleSave} disabled={saving} style={{ marginLeft: 8 }}>{saving ? 'Saving…' : 'Save store'}</button>
        </div>
      </div>
    </div>
  )
}
