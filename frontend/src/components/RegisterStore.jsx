import React, { useState } from 'react'
import api from '../services/api'
import * as ui from '../services/ui'

export default function RegisterStore() {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '', password: '', confirm: '' })

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    // basic validation
    if (!form.name || !form.username || !form.email || !form.password || !form.confirm) {
      return ui.showAlert('Please fill required fields')
    }
    if (form.password !== form.confirm) {
      return ui.showAlert('Passwords do not match')
    }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name,
        username: form.username,
        email: form.email,
        phone: form.phone,
        password: form.password
      }
      const resp = await api.post('/stores/register', payload).catch(err => err?.response)
      if (resp && resp.data && resp.data.ok) {
        ui.showSnackbar('Store registered successfully', 'success')
        setForm({ name: '', username: '', email: '', phone: '', password: '', confirm: '' })
        // redirect to login after a short delay so user sees the toast
        setTimeout(() => {
          if (window.__appNavigate) return window.__appNavigate('/login')
          try { window.history.pushState(null, '', '/login') } catch (err) {}
          window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }))
        }, 1200)
      } else if (resp && resp.data && resp.data.error) {
        setError(resp.data.error)
      } else {
        setError('Failed to register store')
      }
    } catch (err) {
      console.error('register failed', err)
      setError('Failed to register store')
    } finally { setSaving(false) }
  }

  return (
    <div className="login-outer">
      <div className="login-card" role="region" aria-label="Register a new store">
        <div className="login-brand">
          <div className="logo" aria-hidden>DP</div>
          <div>
            <h1>DinoPos</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form" aria-describedby="register-error">
          {error && <div id="register-error" className="error">{error}</div>}
          <h3 style={{ marginTop: 0 }}>Register a new store</h3>
          <p style={{ marginTop: 0, marginBottom: 8 }}>Enter basic information to register your store.</p>

          <div className="field">
            <label className="field-label">Store name</label>
            <input className="input" value={form.name} onChange={e => setField('name', e.target.value)} required />
          </div>

          <div className="row">
            <div style={{ flex: 1 }} className="field">
              <label className="field-label">Username</label>
              <input className="input" value={form.username} onChange={e => setField('username', e.target.value)} required />
            </div>
            <div style={{ width: 260 }} className="field">
              <label className="field-label">Phone</label>
              <input className="input" value={form.phone} onChange={e => setField('phone', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label className="field-label">Email</label>
            <input type="email" className="input" value={form.email} onChange={e => setField('email', e.target.value)} required />
          </div>

          <div className="row">
            <div style={{ flex: 1 }} className="field">
              <label className="field-label">Password</label>
              <input type="password" className="input" value={form.password} onChange={e => setField('password', e.target.value)} required />
            </div>
            <div style={{ width: 260 }} className="field">
              <label className="field-label">Confirm password</label>
              <input type="password" className="input" value={form.confirm} onChange={e => setField('confirm', e.target.value)} required />
            </div>
          </div>

          <div className="login-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-ghost" type="button" onClick={() => { setForm({ name: '', username: '', email: '', phone: '', password: '', confirm: '' }) }}>Reset</button>
            <button className="btn" style={{ marginLeft: 8 }} disabled={saving}>{saving ? 'Registering…' : 'Register store'}</button>
          </div>
        </form>

        <div className="login-foot">
          <small>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); if (window.__appNavigate) return window.__appNavigate('/login'); try { window.history.pushState(null, '', '/login') } catch (err) {} window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' })) }}>Sign in</a>.</small>
        </div>
      </div>
    </div>
  )
}
