import React, { useState, useEffect } from 'react'
import ProfileSettings from './ProfileSettings'
import StoreSettings from './StoreSettings'
import POSConfig from './POSConfig'
import SystemLogs from './SystemLogs'
import api from '../../services/api'

const tabs = [
  { key: 'profile', label: 'Profile settings' },
  { key: 'store', label: 'Store settings' },
  { key: 'pos', label: 'POS configuration' },
  { key: 'logs', label: 'System Logs' }
]

export default function Settings() {
  const [active, setActive] = useState(() => {
    try { const p = window.location.pathname.split('/')[2]; return p || 'profile' } catch (e) { return 'profile' }
  })

  const [sub, setSub] = useState({ plan: 'Pro Plan Active', creditsLeft: 150, renews: 'Feb 15, 2025' })

  useEffect(() => {
    async function loadSub() {
      try {
        const r = await api.get('/subscription').catch(() => null)
        if (r && r.data) setSub(r.data)
      } catch (e) {}
    }
    loadSub()
  }, [])

  useEffect(() => {
    function onNavigate(e) {
      const to = e?.detail || window.location.pathname
      if (!to.startsWith('/settings')) return
      const seg = to.split('/')[2]
      setActive(seg || 'profile')
    }
    window.addEventListener('navigate', onNavigate)
    window.addEventListener('popstate', onNavigate)
    return () => { window.removeEventListener('navigate', onNavigate); window.removeEventListener('popstate', onNavigate) }
  }, [])

  function go(k) {
    try { window.history.pushState(null, '', '/settings/' + k) } catch (e) {}
    setActive(k)
    try { window.dispatchEvent(new CustomEvent('navigate', { detail: '/settings/' + k })) } catch (e) { }
  }

  return (
    <div className="settings-page" style={{ display: 'flex', gap: 18 }}>
      <aside style={{ width: 260, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 18, boxSizing: 'border-box' }} className="card">
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Settings</h3>
          <nav>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {tabs.map(t => (
                <li key={t.key} style={{ marginBottom: 8 }}>
                  <button onClick={() => go(t.key)} className={`btn-link ${active === t.key ? 'active' : ''}`} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8 }}>{t.label}</button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{
            width: '100%',
            background: 'linear-gradient(135deg,#7b4dff,#a064ff)',
            color: 'white', padding: 14, borderRadius: 12, boxShadow: '0 10px 30px rgba(120,60,200,0.12)', textAlign: 'left'
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{sub.plan}</div>
            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{sub.creditsLeft} transactions left</div>
            <div style={{ marginTop: 8, opacity: 0.95 }}>Renews: {sub.renews}</div>
            <div style={{ marginTop: 12 }}>
              <button className="btn" style={{ background: 'rgba(255,255,255,0.14)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 10 }}>Upgrade</button>
            </div>
          </div>
        </div>
      </aside>
      <section style={{ flex: 1 }}>
        <div className="card">
          {active === 'profile' && <ProfileSettings />}
          {active === 'store' && <StoreSettings />}
          {active === 'pos' && <POSConfig />}
          {active === 'logs' && <SystemLogs />}
        </div>
      </section>
    </div>
  )
}
