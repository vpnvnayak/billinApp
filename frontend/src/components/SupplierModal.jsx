import React, { useEffect, useState } from 'react'
import api from '../services/api'
import * as ui from '../services/ui'

export default function SupplierModal({ show, supplier, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [execName, setExecName] = useState('')
  const [phone1, setPhone1] = useState('')
  const [phone2, setPhone2] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [tin, setTin] = useState('')
  const [stateValue, setStateValue] = useState('Kerala')
  const [creditDue, setCreditDue] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (supplier) {
      setName(supplier.name || '')
      setPhone(supplier.phone || '')
      setEmail(supplier.email || '')
      setWebsite(supplier.website || '')
      setExecName(supplier.executive_name || '')
      setPhone1(supplier.phone1 || '')
      setPhone2(supplier.phone2 || '')
      setAddress(supplier.address || '')
      setCity(supplier.city || '')
      setTin(supplier.tin_gstin || '')
      setStateValue(supplier.state || 'Kerala')
      setCreditDue(supplier.credit_due || 0)
    } else {
      // reset
      setName(''); setPhone(''); setEmail(''); setWebsite(''); setExecName(''); setPhone1(''); setPhone2(''); setAddress(''); setCity(''); setTin(''); setStateValue('Kerala'); setCreditDue(0)
    }
  }, [supplier, show])

  async function save() {
    try {
      setLoading(true)
      const payload = {
        name: name.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        executive_name: execName.trim() || null,
        phone1: phone1.trim() || null,
        phone2: phone2.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        tin_gstin: tin.trim() || null,
        state: stateValue || null,
        credit_due: Number(creditDue) || 0
      }
      let res
      if (supplier && supplier.id) {
        res = await api.put(`/suppliers/${supplier.id}`, payload)
      } else {
        res = await api.post('/suppliers', payload)
      }
      const created = res && res.data ? res.data : null
      ui.showSnackbar(supplier && supplier.id ? 'Supplier updated' : 'Supplier created', 'success')
      if (onSaved) onSaved(created)
    } catch (e) {
      console.error('save supplier failed', e)
      ui.showAlert('Failed to save supplier')
    } finally {
      setLoading(false)
    }
  }

  if (!show) return null
  return (
    <div className="modal-overlay">
      <div className="modal large-modal suppliers-modal">
        <div className="modal-header">
          <h3>{supplier && supplier.id ? 'Edit Supplier' : 'Add Supplier'}</h3>
          <button className="btn btn-ghost" onClick={() => onClose && onClose()}>Close</button>
        </div>
        <div className="modal-grid">
          <div className="field"><label className="field-label">Company Name</label><input placeholder="Company Name" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label className="field-label">Phone</label><input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div className="field"><label className="field-label">Email</label><input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label className="field-label">Website</label><input placeholder="Website" value={website} onChange={e => setWebsite(e.target.value)} /></div>
          <div className="field"><label className="field-label">Executive Name</label><input placeholder="Executive Name" value={execName} onChange={e => setExecName(e.target.value)} /></div>
          <div className="field"><label className="field-label">Phone 1</label><input placeholder="Phone 1" value={phone1} onChange={e => setPhone1(e.target.value)} /></div>
          <div className="field"><label className="field-label">Credit to be Paid</label><input placeholder="0.00" value={creditDue} onChange={e => setCreditDue(e.target.value)} /></div>
          <div className="field"><label className="field-label">Phone 2</label><input placeholder="Phone 2" value={phone2} onChange={e => setPhone2(e.target.value)} /></div>
          <div className="field address-field"><label className="field-label">Address</label><textarea placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} /></div>
          <div className="field"><label className="field-label">City</label><input placeholder="City" value={city} onChange={e => setCity(e.target.value)} /></div>
          <div className="field"><label className="field-label">TIN/GSTIN</label><input placeholder="TIN/GSTIN" value={tin} onChange={e => setTin(e.target.value)} /></div>
          <div className="field"><label className="field-label">State</label><select value={stateValue} onChange={e => setStateValue(e.target.value)}><option>Kerala</option><option>Tamil Nadu</option><option>Karnataka</option><option>Andhra Pradesh</option><option>Other</option></select></div>
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick={save} disabled={loading}>{loading ? 'Saving...' : (supplier && supplier.id ? 'Save changes' : 'Create')}</button>
          <button className="btn btn-ghost" onClick={() => onClose && onClose()}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
