import React, { createContext, useContext, useEffect, useState } from 'react'
import api from '../../services/api'

const STORE_CACHE_KEY = 'storeSettings'
const SELECTED_STORE_KEY = 'selectedStore'
const AVAILABLE_STORES_KEY = 'availableStores'

const UIContext = createContext(null)

export function useUI() {
  return useContext(UIContext)
}

export function UIProvider({ children }) {
  const [snack, setSnack] = useState({ show: false, message: '', type: 'info' })
  const [modal, setModal] = useState({ open: false, title: '', message: '', onlyOk: false, resolve: null })

  useEffect(() => {
    // expose a simple global UI bridge so existing code can call window.__ui.xxx
    if (typeof window !== 'undefined') {
      window.__ui = {
        alert: (msg, title) => showAlert(msg, title),
        confirm: (msg, title) => showConfirm(msg, title),
        snackbar: (msg, type) => showSnackbar(msg, type)
      }
    }
    return () => {
      if (typeof window !== 'undefined' && window.__ui) delete window.__ui
    }
  }, [])

  // store-specific context: best-effort load from cache/localStorage and attempt API fetch if token present
  const [store, setStore] = useState(() => {
    try {
      const raw = localStorage.getItem(STORE_CACHE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) { return null }
  })
  const [selectedStore, setSelectedStore] = useState(() => {
    try {
      const fromLocal = JSON.parse(localStorage.getItem(SELECTED_STORE_KEY))
      if (fromLocal) return fromLocal
    } catch (e) {}
    try {
      const match = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('selectedStore='))
      if (match) return JSON.parse(match.split('=')[1]) || null
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(SELECTED_STORE_KEY)) || null } catch (e) { return null }
  })
  const [availableStores, setAvailableStores] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AVAILABLE_STORES_KEY)) || [] } catch (e) { return [] }
  })

  // load fresh settings if token is available (non-blocking)
  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const [sResp, storesResp] = await Promise.allSettled([api.get('/settings'), api.get('/admin/stores')])
        const sOk = sResp && sResp.status === 'fulfilled' && sResp.value && sResp.value.data
        const storesOk = storesResp && storesResp.status === 'fulfilled' && storesResp.value && storesResp.value.data
        const resp = sOk ? sResp.value : null
        if (resp && resp.data) {
          setStore(resp.data)
          try { localStorage.setItem(STORE_CACHE_KEY, JSON.stringify(resp.data)) } catch (e) {}
        }
        if (storesOk) {
          const list = storesResp.value.data || []
          setAvailable(list)
          // if no selectedStore yet, pick from cookie or default to first
          if (!selectedStore && list && list.length) {
            try {
              const cookieMatch = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('selectedStore='))
              if (cookieMatch) {
                const v = JSON.parse(cookieMatch.split('=')[1])
                if (v) setSelectedStore(v)
              } else {
                setSelectedStore(list[0])
              }
            } catch (e) {
              setSelectedStore(list[0])
            }
          }
        }
      } catch (e) {
        // ignore failures; keep cached store if present
      }
    }
    load()
  }, [])

  function switchStore(storeObj) {
    // storeObj should be an object { id, name, ... } — this is a client-side switcher only unless backend supports switching
    // ask server to switch (if available)
    (async () => {
      try {
        await api.post('/admin/stores/switch', { id: storeObj.id })
      } catch (e) {
        // ignore server errors; still update client state
      }
    })()
    setSelectedStore(storeObj)
    try { localStorage.setItem(SELECTED_STORE_KEY, JSON.stringify(storeObj)) } catch (e) {}
    // also set store context to the selected store's settings if available locally
    if (storeObj && storeObj.settings) {
      setStore(storeObj.settings)
      try { localStorage.setItem(STORE_CACHE_KEY, JSON.stringify(storeObj.settings)) } catch (e) {}
    }
    // notify listeners that store changed so UI can refetch store-scoped data
    try { window.dispatchEvent(new CustomEvent('store:changed', { detail: storeObj })) } catch (e) {}
  }

  function setAvailable(list) {
    setAvailableStores(list || [])
    try { localStorage.setItem(AVAILABLE_STORES_KEY, JSON.stringify(list || [])) } catch (e) {}
  }

  function showSnackbar(message, type = 'info') {
    setSnack({ show: false, message: '', type })
    // small delay to restart animation if same message repeated
    setTimeout(() => setSnack({ show: true, message, type }), 20)
    // auto-hide
    setTimeout(() => setSnack(s => ({ ...s, show: false })), 3000)
  }

  function showAlert(message, title) {
    return new Promise(resolve => {
      setModal({ open: true, title: title || 'Notice', message: String(message || ''), onlyOk: true, resolve })
    })
  }

  function showConfirm(message, title) {
    return new Promise(resolve => {
      setModal({ open: true, title: title || 'Confirm', message: String(message || ''), onlyOk: false, resolve })
    })
  }

  function closeModal(result) {
    try {
      if (modal && modal.resolve) modal.resolve(result)
    } catch (e) {}
    setModal({ open: false, title: '', message: '', onlyOk: false, resolve: null })
  }

  const ctx = { showSnackbar, showAlert, showConfirm }
  // expose store helpers in UI context
  ctx.store = store
  ctx.setStore = setStore
  ctx.selectedStore = selectedStore
  ctx.switchStore = switchStore
  ctx.availableStores = availableStores
  ctx.setAvailableStores = setAvailable

  return (
    <UIContext.Provider value={ctx}>
      {children}
      {/* Snackbar */}
      <div className={`snackbar ${snack.show ? 'show' : ''} ${snack.type || 'info'}`} role="status" aria-live="polite">
        {snack.message}
      </div>

      {/* Themed modal for alerts/confirms */}
      {modal.open && (
        <div className="modal-overlay">
          <div className="modal large-modal">
            <div className="modal-header">
              <h3>{modal.title}</h3>
              <button className="btn btn-ghost" onClick={() => closeModal(false)}>X</button>
            </div>
            <div style={{ marginBottom: 12 }}>{modal.message}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {!modal.onlyOk && <button className="btn btn-ghost" onClick={() => closeModal(false)}>Cancel</button>}
              <button className="btn primary" onClick={() => closeModal(true)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  )
}

export default UIProvider
