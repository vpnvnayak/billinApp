import React, { useEffect, useRef } from 'react'
import { UserIcon, CubeIcon, ReceiptPercentIcon, CurrencyDollarIcon, ChartBarIcon, CalendarDaysIcon, Bars3Icon, Cog6ToothIcon } from '@heroicons/react/24/outline'

export default function SideNav({ collapsed, onToggle }) {
  const links = [
    { name: 'Dashboard', icon: <ChartBarIcon className="h-5 w-5" />, to: '/' },
    { name: 'POS', icon: <CurrencyDollarIcon className="h-5 w-5" />, to: '/pos' },
  { name: 'Contacts', icon: <UserIcon className="h-5 w-5" />, to: '/contacts' },
  { name: 'Suppliers', icon: <UserIcon className="h-5 w-5" />, to: '/suppliers' },
  { name: 'Products', icon: <CubeIcon className="h-5 w-5" />, to: '/products' },
  { name: 'Purchases', icon: <ReceiptPercentIcon className="h-5 w-5" />, to: '/purchases' },
    { name: 'Sales', icon: <CurrencyDollarIcon className="h-5 w-5" />, to: '/sales' },
    { name: 'Stock', icon: <ChartBarIcon className="h-5 w-5" />, to: '/stock' },
    { name: 'Daybook', icon: <CalendarDaysIcon className="h-5 w-5" />, to: '/daybook' }
  ]
  const rootRef = useRef()

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
          {links.map(l => (
            <li key={l.name}>
              <a href="#" title={l.name} onClick={e => { 
                e.preventDefault(); 
                if (typeof window.__appNavigate === 'function') {
                  window.__appNavigate(l.to)
                  return
                }
                try { window.history.pushState(null, '', l.to) } catch (err) {}
                // dispatch a custom navigate event so app reacts without relying solely on popstate
                try { window.dispatchEvent(new CustomEvent('navigate', { detail: l.to })) } catch (err) { const ev = new PopStateEvent('popstate'); window.dispatchEvent(ev) }
              }}>
                <span className="icon" aria-hidden>{l.icon}</span>
                <span className="label">{l.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidenav-footer">
        <a href="#" className="footer-link" onClick={e => { e.preventDefault(); try { window.__appNavigate('/settings') } catch(e){ try { window.history.pushState(null,'','/settings'); window.dispatchEvent(new CustomEvent('navigate',{detail:'/settings'})) } catch(err){} } }} title="Settings">
          <span className="icon"><Cog6ToothIcon className="h-5 w-5" /></span>
          <span className="label">Settings</span>
        </a>
      </div>
    </aside>
  )
}
