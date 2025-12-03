import React, { useEffect, useRef, useState } from 'react'
import { UserIcon, CubeIcon, ReceiptPercentIcon, CurrencyDollarIcon, ChartBarIcon, CalendarDaysIcon, Bars3Icon, Cog6ToothIcon, ChartPieIcon } from '@heroicons/react/24/outline'

export default function SideNav({ collapsed, onToggle, user }) {
  const rootRef = useRef()
  const links = [
    { name: 'Dashboard', icon: <ChartBarIcon className="h-5 w-5" />, to: '/' },
    { name: 'POS', icon: <CurrencyDollarIcon className="h-5 w-5" />, to: '/pos' },
    { name: 'Contacts', icon: <UserIcon className="h-5 w-5" />, to: '/contacts' },
    { name: 'Suppliers', icon: <UserIcon className="h-5 w-5" />, to: '/suppliers' },
    { name: 'Products', icon: <CubeIcon className="h-5 w-5" />, to: '/products' },
    { name: 'Purchases', icon: <ReceiptPercentIcon className="h-5 w-5" />, to: '/purchases' },
    { name: 'Sales', icon: <CurrencyDollarIcon className="h-5 w-5" />, to: '/sales' },
    { name: 'Stock', icon: <ChartBarIcon className="h-5 w-5" />, to: '/stock' },
    { name: 'Daybook', icon: <CalendarDaysIcon className="h-5 w-5" />, to: '/daybook' },
    { name: 'Marketing', icon: <ReceiptPercentIcon className="h-5 w-5" />, to: '/marketing', submenu: [
      { name: 'Discounts', to: '/marketing/discounts' },
      { name: 'Posters', to: '/marketing/posters' },
      { name: 'WhatsApp', to: '/marketing/whatsapp' }
    ] },
    { name: 'Reports', icon: <ChartPieIcon className="h-5 w-5" />, to: '/reports' }
  ]

  // normalize roles
  let roles = (user && user.roles) || []
  if (Array.isArray(roles) && roles.length > 0 && typeof roles[0] === 'object') {
    roles = roles.map(r => (r && r.name) || String(r))
  }
  const isCashier = roles.includes('cashier')

  const [openMenus, setOpenMenus] = useState({})
  const [openDropdown, setOpenDropdown] = useState(null)

  // click outside to close dropdown
  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target)) setOpenDropdown(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function toggleMenu(name) {
    setOpenMenus(prev => ({ ...prev, [name]: !prev[name] }))
  }

  // auto-open submenu when route matches
  useEffect(() => {
    function updateOpen() {
      try {
        const p = window.location.pathname || ''
        const newOpen = {}
        for (const l of links) {
          if (l.submenu) {
            for (const si of l.submenu) {
              if (p === l.to || p.startsWith(si.to)) { newOpen[l.name] = true; break }
            }
          }
        }
        setOpenMenus(prev => ({ ...prev, ...newOpen }))
      } catch (e) {}
    }
    updateOpen()
    window.addEventListener('navigate', updateOpen)
    window.addEventListener('popstate', updateOpen)
    return () => { window.removeEventListener('navigate', updateOpen); window.removeEventListener('popstate', updateOpen) }
  }, [])

  if (roles.includes('superadmin') || roles.includes('storeadmin')) {
    const insertAt = links.findIndex(l => l.name === 'Sales')
    const usersLink = { name: 'Users', icon: <UserIcon className="h-5 w-5" />, to: '/users' }
    if (insertAt >= 0) links.splice(insertAt + 1, 0, usersLink)
    else links.push(usersLink)
  }

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    function check() {
      const has = el.scrollHeight > el.clientHeight + 2
      if (has) el.classList.add('has-overflow')
      else el.classList.remove('has-overflow')
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function navigateTo(to) {
    if (typeof window.__appNavigate === 'function') {
      window.__appNavigate(to)
      return
    }
    try { window.history.pushState(null, '', to) } catch (err) {}
    try { window.dispatchEvent(new CustomEvent('navigate', { detail: to })) } catch (err) { const ev = new PopStateEvent('popstate'); window.dispatchEvent(ev) }
  }

  // render helper for links list
  function renderLinks(filteredLinks) {
    return filteredLinks.map(l => (
      <li key={l.name} style={{ position: 'relative' }}>
        {l.submenu ? (
          <>
            <button
              type="button"
              title={l.name}
              onClick={e => { e.preventDefault(); setOpenDropdown(prev => (prev === l.name ? null : l.name)) }}
              style={{ background: 'transparent', border: 'none', padding: 8, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'inherit' }}
              aria-expanded={openDropdown === l.name}
            >
              <span className="icon" aria-hidden>{l.icon}</span>
              <span className="label">{l.name}</span>
            </button>

            {openDropdown === l.name && (
              <div
                className="nav-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  minWidth: 180,
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  borderRadius: 6,
                  padding: 8,
                  zIndex: 2000,
                  border: '1px solid rgba(0,0,0,0.06)'
                }}
              >
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {l.submenu.map(si => (
                    <li key={si.name} style={{ marginBottom: 4 }}>
                      <a
                        href="#"
                        onClick={e => { e.preventDefault(); setOpenDropdown(null); navigateTo(si.to) }}
                        style={{ display: 'block', padding: '8px 10px', color: 'var(--color-text)', textDecoration: 'none', borderRadius: 4 }}
                      >
                        {si.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <a href="#" title={l.name} onClick={e => { e.preventDefault(); setOpenDropdown(null); navigateTo(l.to) }}>
            <span className="icon" aria-hidden>{l.icon}</span>
            <span className="label">{l.name}</span>
          </a>
        )}
      </li>
    ))
  }

  // cashier view: hide Dashboard and Reports
  if (isCashier) {
    const filtered = links.filter(l => !['Dashboard', 'Reports', 'Users'].includes(l.name))
    return (
      <aside ref={rootRef} className={`sidenav ${collapsed ? 'collapsed' : ''}`} aria-label="Primary">
        <div className="sidenav-header">
          <button className="hamburger" onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}><Bars3Icon className="h-5 w-5" /></button>
          <div className="brand-wrap" style={{ marginLeft: collapsed ? 0 : 8 }}>
            {!collapsed ? <h2 className="brand">DinoPos</h2> : null}
          </div>
        </div>
        <nav className="sidenav-nav">
          <ul>
            {renderLinks(filtered)}
          </ul>
        </nav>
        <div className="sidenav-footer">
          <a href="#" className="footer-link" onClick={e => { e.preventDefault(); navigateTo('/settings') }} title="Settings">
            <span className="icon"><Cog6ToothIcon className="h-5 w-5" /></span>
            <span className="label">Settings</span>
          </a>
        </div>
      </aside>
    )
  }

  return (
    <aside ref={rootRef} className={`sidenav ${collapsed ? 'collapsed' : ''}`} aria-label="Primary">
      <div className="sidenav-header">
        <button className="hamburger" onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}><Bars3Icon className="h-5 w-5" /></button>
        <div className="brand-wrap" style={{ marginLeft: collapsed ? 0 : 8 }}>
          {!collapsed ? <h2 className="brand">DinoPos</h2> : null}
        </div>
      </div>
      <nav className="sidenav-nav">
        <ul>
          {renderLinks(links)}
        </ul>
      </nav>
      <div className="sidenav-footer">
        <a href="#" className="footer-link" onClick={e => { e.preventDefault(); navigateTo('/settings') }} title="Settings">
          <span className="icon"><Cog6ToothIcon className="h-5 w-5" /></span>
          <span className="label">Settings</span>
        </a>
      </div>
    </aside>
  )
}
