import React from 'react'
import { useUI } from './UIProvider'

export default function StoreHeader() {
  const { store, selectedStore } = useUI() || {}
  const s = store || selectedStore || null
  if (!s) return null
  let logo = s.logo_url || s.logo || null
  // normalize logo path: if it starts with '/uploads' or is relative, prefix API base
  try {
    const viteBase = import.meta.env.VITE_API_BASE
    const apiBase = viteBase || `${window.location.protocol}//${window.location.hostname}:4000`
    if (logo && logo.startsWith('/')) {
      // absolute path on server
      logo = apiBase + logo
    }
  } catch (e) {}
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {logo ? <img src={logo} alt={s.name || 'store logo'} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--color-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)' }}>{(s.name||'S').slice(0,1)}</div>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name || ''}</div>
        {s.address ? <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{s.address.split('\n')[0]}</div> : null}
      </div>
    </div>
  )
}
