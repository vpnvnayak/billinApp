import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import { isValidEmail, isValidPhone } from '../../utils/validation'

export default function ProfileSettings() {
  const [loading, setLoading] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [emailError, setEmailError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const r = await api.get('/auth/me')
        if (!mounted) return
        if (r && r.data) {
          setFullName(r.data.full_name || '')
          setEmail(r.data.email || '')
          setPhone(r.data.phone || '')
        }
      } catch (e) {
        console.error('failed to load profile', e)
      }
    })()
    return () => { mounted = false }
  }, [])

  async function save() {
    try {
      setLoading(true)
      setEmailError('')
      setPhoneError('')
      if (email && !isValidEmail(email)) {
        setEmailError('Invalid email')
        setLoading(false)
        return
      }
      if (phone && !isValidPhone(phone)) {
        setPhoneError('Invalid phone')
        setLoading(false)
        return
      }
      const payload = { full_name: fullName, email: email, phone: phone }
      if (newPassword) {
        payload.current_password = currentPassword
        payload.new_password = newPassword
      }
      await api.put('/auth/me', payload)
      import('../../services/ui').then(u => u.showSnackbar('Profile updated', 'success'))
      // clear password fields
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      console.error('failed to save profile', err)
      const msg = (err && err.response && err.response.data && err.response.data.error) || 'Failed to save profile'
      import('../../services/ui').then(u => u.showAlert(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <h3 style={{ marginTop: 0 }}>Profile settings</h3>
        <p style={{ marginTop: 8 }}>Update your name, email, phone and password here.</p>
      </div>

      <div style={{ width: 380, minWidth: 300 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>Display name</label>
        <input className="input" style={{ width: '100%', marginBottom: 12 }} placeholder="Your name" value={fullName} onChange={e => setFullName(e.target.value)} />

  <label style={{ display: 'block', marginBottom: 8 }}>Email</label>
  <input className="input" style={{ width: '100%', marginBottom: 12 }} placeholder="you@example.com" value={email} onChange={e => { setEmail(e.target.value); if (emailError) setEmailError('') }} />
  {emailError ? <div className="error">{emailError}</div> : null}

  <label style={{ display: 'block', marginBottom: 8 }}>Phone</label>
  <input className="input" style={{ width: '100%', marginBottom: 12 }} placeholder="Phone" value={phone} onChange={e => { setPhone(e.target.value); if (phoneError) setPhoneError('') }} />
  {phoneError ? <div className="error">{phoneError}</div> : null}

        <hr />
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>Current password</label>
          <input type="password" className="input" style={{ width: '100%', marginBottom: 12 }} placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />

          <label style={{ display: 'block', marginBottom: 8 }}>New password</label>
          <input type="password" className="input" style={{ width: '100%', marginBottom: 12 }} placeholder="New password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </div>

        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start' }}>
          <button className="btn" onClick={save} disabled={loading || !!emailError || !!phoneError}>{loading ? 'Saving...' : 'Save profile'}</button>
        </div>
      </div>
    </div>
  )
}
