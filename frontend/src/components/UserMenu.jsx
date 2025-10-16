import React, { useState, useRef, useEffect } from 'react'

export default function UserMenu({ user, onLogout, onSettings }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  return (
    <div className="user-menu" ref={ref} style={{ position: 'relative' }}>
      <button className="user-btn" onClick={() => setOpen(s => !s)} aria-haspopup="true" aria-expanded={open}>
        <span className="avatar">{(user?.full_name || user?.email || 'U').charAt(0).toUpperCase()}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="user-dropdown card" role="menu">
          <div className="user-dropdown-item" onClick={() => { setOpen(false); try { window.__appNavigate('/settings') } catch(e){ onSettings && onSettings() } }}>Settings</div>
          <div className="user-dropdown-item" onClick={() => { setOpen(false); onLogout && onLogout() }}>Logout</div>
        </div>
      )}
    </div>
  )
}
