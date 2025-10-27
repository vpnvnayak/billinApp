import React, { useEffect, useState } from 'react'
import api, { setTokenLocal } from './services/api'
import Login from './components/Login'
import Profile from './components/Profile'
import AdminUsers from './components/AdminUsers'
import SideNav from './components/SideNav'
import UserMenu from './components/UserMenu'
import Products from './components/Products'
import POS from './components/POS'
import Sales from './components/Sales'
import Dashboard from './components/Dashboard'
import Customers from './components/Customers'
import Suppliers from './components/Suppliers'
import Purchases from './components/Purchases'
import PurchaseDetail from './components/PurchaseDetail'
import Settings from './components/settings/Settings'
import Reports from './components/Reports'
import RegisterStore from './components/RegisterStore'
import { registerPrintHandlers } from './services/print'
import UIProvider from './components/ui/UIProvider'
import StoreSwitcher from './components/ui/StoreSwitcher'
import StoreHeader from './components/ui/StoreHeader'

export default function App() {
  const [products, setProducts] = useState([])
  const [user, setUser] = useState(null)
  const [adminStats, setAdminStats] = useState(null)
  const [store, setStore] = useState(null)
  const [sideCollapsed, setSideCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('sideCollapsed')
      return v === '1'
    } catch (e) { return false }
  })
  const [route, setRoute] = useState(() => window.location.pathname || '/login')
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    function onPop() {
      const token = localStorage.getItem('token')
      const p = window.location.pathname
      // allow public routes (login, register) without a token
      if (!token && p !== '/login' && p !== '/register') {
        try { window.history.replaceState(null, '', '/login') } catch (e) {}
        // force navigation to ensure the protected UI is not restorable via back
        window.location.replace('/login')
        return
      }
      setRoute(window.location.pathname)
    }

    function onPageShow() {
      const token = localStorage.getItem('token')
      const p = window.location.pathname
      if (!token && p !== '/login' && p !== '/register') {
        try { window.history.replaceState(null, '', '/login') } catch (e) {}
        window.location.replace('/login')
      }
    }

    window.addEventListener('popstate', onPop)
    window.addEventListener('pageshow', onPageShow)
    // custom navigate events (dispatched by SideNav)
    function onNavigate(e) {
      const to = e?.detail || window.location.pathname
      const token = localStorage.getItem('token')
      if (!token) {
        // allow navigation to public routes (login, register) when unauthenticated
        if (to === '/login' || to === '/register') {
          try { window.history.pushState(null, '', to) } catch (err) {}
          setRoute(to)
          return
        }
        try { window.history.replaceState(null, '', '/login') } catch (err) {}
        window.location.replace('/login')
        return
      }
      setRoute(to)
    }
    window.addEventListener('navigate', onNavigate)
    // expose a direct navigation helper so child components can call into App without events
    window.__appNavigate = function(to) {
      const token = localStorage.getItem('token')
      if (!token) {
        // allow unauthenticated navigation to login and register
        if (to === '/login' || to === '/register') {
          try { window.history.pushState(null, '', to) } catch (err) {}
          setRoute(to)
          return
        }
        try { window.history.replaceState(null, '', '/login') } catch (err) {}
        window.location.replace('/login')
        return
      }
      try { window.history.pushState(null, '', to) } catch (e) {}
      setRoute(to)
    }
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('pageshow', onPageShow); window.removeEventListener('navigate', onNavigate) }
  }, [])

  useEffect(() => {
    api.get('/products').then(r => setProducts(r.data)).catch(console.error)
  }, [])

  useEffect(() => {
    // perform an initial auth check (me) for protected routes; show loader while checking
    // register global print handlers so Sales page can print even if POS hasn't been opened
    try { registerPrintHandlers() } catch (e) { console.error('print handler registration failed', e) }
    async function check() {
      setCheckingAuth(true)
      // if on login route, skip me() but still hide loader
      if (window.location.pathname === '/login') {
        setCheckingAuth(false)
        return
      }
      const token = localStorage.getItem('token')
      if (!token) {
        try { window.history.replaceState(null, '', '/login') } catch (e) {}
        setRoute('/login')
        setCheckingAuth(false)
        return
      }
      try {
        const r = await api.get('/auth/me')
        setUser(r.data)
        // fetch store settings for header display (best-effort)
        api.get('/settings').then(rr => setStore(rr.data)).catch(() => {})
        if (r.data?.roles?.includes('admin')) {
          api.get('/admin/stats').then(rr => setAdminStats(rr.data)).catch(() => {})
        }
      } catch (err) {
        // token invalid or expired
        localStorage.removeItem('token')
        try { window.history.replaceState(null, '', '/login') } catch (e) {}
        setRoute('/login')
      } finally {
        setCheckingAuth(false)
      }
    }
    check()
  }, [])

  function handleLogin(user) {
    setUser(user)
    // attempt to fetch admin stats if user has admin role
    if (user?.roles?.includes('admin')) {
      api.get('/admin/stats').then(r => setAdminStats(r.data)).catch(() => {})
    }
    // navigate to home
    try { window.history.pushState(null, '', '/') } catch (e) {}
    setRoute('/')
  }

  function logout() {
    // call backend to revoke refresh token (cookie-based)
    api.post('/auth/logout', {}).catch(() => {})
    setTokenLocal(null)
    setUser(null)
    setAdminStats(null)
    // replace history and force full navigation to login so Back cannot restore protected pages
    try { window.history.replaceState(null, '', '/login') } catch (e) {}
    window.location.replace('/login')
  }

  // Route-aware rendering: show dedicated login page for /login
  if (checkingAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-2)' }}>
        <div className="app-loader">
          <div>
            <div className="loader" aria-hidden></div>
            <div className="loader-text">Checking session…</div>
          </div>
        </div>
      </div>
    )
  }

  if (route === '/login') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-2)' }}>
        <div style={{ width: 420 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Sign in to DinoPos</h2>
            <Login onLogin={handleLogin} />
          </div>
        </div>
      </div>
    )
  }

  if (route === '/register') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-2)' }}>
        <div style={{ width: 760 }}>
          <div className="card">
            <RegisterStore />
          </div>
        </div>
      </div>
    )
  }

  return (
    <UIProvider>
      <div className="app-layout">
        <SideNav collapsed={sideCollapsed} onToggle={() => setSideCollapsed(s => { const nv = !s; try { localStorage.setItem('sideCollapsed', nv ? '1' : '0') } catch (e) {} return nv })} />
        <div className={`app ${sideCollapsed ? 'nav-collapsed' : ''}`}>
          <div className="panel">
            <header>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ margin: 0 }}>{(() => {
                    const map = {
                      '/': 'Dashboard',
                      '/products': 'Products',
                      '/pos': 'POS',
                      '/contacts': 'Contacts',
                      '/sales': 'Sales',
                      '/users': 'Users',
                      '/profile': 'Profile'
                    }
                    if (route && route.startsWith('/settings')) return 'Settings'
                    return map[route] || route.replace('/', '') || 'Dashboard'
                  })()}</h1>
                  {store && store.name ? <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{store.name}</div> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="header-controls">
                    {route === '/' ? <div className="date-pill">Current week</div> : null}
                  </div>
                  {/* store logo + title */}
                  <StoreHeader />
                  <StoreSwitcher />
                  <UserMenu user={user} onLogout={logout} onSettings={() => { import('./services/ui').then(m => m.showAlert('Settings placeholder')) }} />
                </div>
              </div>
            </header>
            <main>
              {!user && <Login onLogin={handleLogin} />}
              {route === '/products' && <section className="products"><Products /></section>}
              {route === '/pos' && <section className="products"><POS /></section>}
              {route === '/contacts' && <section className="products"><Customers /></section>}
              {route === '/suppliers' && <section className="products"><Suppliers /></section>}
              {route === '/purchases' && <section className="products"><Purchases /></section>}
              {route.startsWith('/purchases/') && (() => {
                const id = route.split('/')[2]
                return <section className="products"><PurchaseDetail id={id} /></section>
              })()}
              {route === '/sales' && <section className="products"><Sales /></section>}
              {route === '/reports' && <section className="products"><Reports /></section>}
              {route === '/' && (
                <section className="dashboard">
                  <Dashboard />
                </section>
              )}
              {route.startsWith('/settings') && <section className="products"><Settings /></section>}
            </main>
          </div>
        </div>
      </div>
    </UIProvider>
  )
}
