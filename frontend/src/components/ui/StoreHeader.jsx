import React, { useState, useMemo } from 'react'
import { useUI } from './UIProvider'

export default function StoreHeader() {
  const { store, selectedStore } = useUI() || {}
  const s = store || selectedStore || null
  const [imgError, setImgError] = useState(false)
  if (!s) return null

  const rawLogo = s.logo_url || s.logo || ''

  const logo = useMemo(() => {
    if (!rawLogo) return null
  let l = String(rawLogo).trim()
  // Normalize legacy API-prefixed paths: some settings may contain '/api/uploads/...' — strip leading '/api'
  if (l.startsWith('/api/')) l = l.replace(/^\/api/, '')
    // if absolute URL or data URL, use as-is
    if (/^https?:\/\//i.test(l) || /^data:/i.test(l)) return l
    try {
      const viteBase = import.meta.env.VITE_API_BASE
      // If VITE_API_BASE contains a trailing /api, strip it to get the backend origin
      const backendOrigin = viteBase ? viteBase.replace(/\/api\/?$/,'') : `${window.location.protocol}//${window.location.hostname}:4000`
      if (l.startsWith('/')) return backendOrigin + l
      // handle common uploads path or plain filename
      if (l.startsWith('uploads/') || l.startsWith('upload/') ) return backendOrigin + '/' + l
      // otherwise assume it's a filename under /uploads
      return backendOrigin + '/uploads/' + l
    } catch (e) {
      return l
    }
  }, [rawLogo])

  // Reset image error when the underlying logo value changes so a new logo will attempt to load
  React.useEffect(() => {
    setImgError(false)
  }, [rawLogo])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {logo && !imgError ? (
        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f7f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img
            src={logo}
            alt={s.name || 'store logo'}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f7f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontWeight: 700 }}>{(s.name||'S').slice(0,1).toUpperCase()}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name || ''}</div>
        {s.address ? <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{s.address.split('\n')[0]}</div> : null}
      </div>
    </div>
  )
}
