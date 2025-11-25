import React, { useEffect, useState } from 'react'
import api from '../../services/api'

export default function SystemLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [level, setLevel] = useState('')
  const [q, setQ] = useState('')
  const [storeId, setStoreId] = useState('')
  const [actionType, setActionType] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params = { page, limit }
        if (level) params.level = level
        if (q) params.q = q
        if (storeId) params.store_id = storeId
        if (actionType) params.action_type = actionType
        const r = await api.get('/logs', { params })
        if (!mounted) return
        const data = r.data || {}
        setLogs(Array.isArray(data.data) ? data.data : [])
        setTotal(Number(data.total || 0))
      } catch (e) {
        console.error('Failed to load logs', e)
        if (!mounted) return
        setError('Failed to load logs')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    // Setup Server-Sent Events to receive live log updates
    let es
    try {
      const token = localStorage.getItem('token')
      const url = token ? `/api/logs/stream?token=${encodeURIComponent(token)}` : '/api/logs/stream'
      es = new EventSource(url)
      es.addEventListener('log', e => {
        try {
          const d = JSON.parse(e.data)
          if (!mounted) return
          setLogs(prev => [d, ...prev].slice(0, 500))
          setTotal(t => Number((t || 0) + 1))
        } catch (err) { }
      })
      es.addEventListener('error', () => {})
    } catch (err) {}
    return () => { mounted = false; try { if (es) es.close() } catch (e) {} }
  }, [page, limit, level, q, storeId, actionType])

  function resetAndReload() {
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / limit))

  return (
    <div>
      {/* Header: title and controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>System Logs</h3>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Date range placeholder */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn" style={{ padding: '8px 12px' }}>◀</button>
            <div style={{ padding: '8px 12px', background: 'var(--color-surface-2)', borderRadius: 8 }}>Current week</div>
            <button className="btn" style={{ padding: '8px 12px' }}>▶</button>
          </div>
          <button className="btn" style={{ padding: '8px 12px' }}>Apply Filter</button>
        </div>
      </div>

      {/* Search and filters row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ display: 'inline-block', width: 40 }} />
            <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') resetAndReload() }} style={{ padding: '10px 14px', width: '100%', borderRadius: 10, border: '1px solid var(--color-border)' }} />
          </div>
        </div>

        <div style={{ marginLeft: 12, display: 'flex', gap: 8 }}>
          <select value={actionType} onChange={e => { setActionType(e.target.value); resetAndReload() }} style={{ padding: '8px 10px', borderRadius: 8 }}>
            <option value="">All actions</option>
            <option value="sale_create">Sale: Create</option>
            <option value="sale_update">Sale: Update</option>
            <option value="sale_delete">Sale: Delete</option>
            <option value="purchase">Purchase</option>
            <option value="stock_adjust">Stock Adjust</option>
            <option value="authentication">Auth</option>
            <option value="error">Errors</option>
          </select>
          <select value={level} onChange={e => { setLevel(e.target.value); resetAndReload() }} style={{ padding: '8px 10px', borderRadius: 8 }}>
            <option value="">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1) }} style={{ padding: '8px 10px', borderRadius: 8 }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {loading && <div>Loading…</div>}
        {error && <div style={{ color: 'var(--color-danger)' }}>{error}</div>}
        {!loading && !error && (!logs || logs.length === 0) && <div style={{ padding: 18 }}>No logs to show</div>}

        {!loading && logs && logs.length > 0 && (
          <div style={{ overflow: 'auto', maxHeight: 560 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-muted)', fontSize: 13 }}>
                  <th style={{ padding: '14px 12px', width: 160 }}>Date/Time</th>
                  <th style={{ padding: '14px 12px', width: 260 }}>User</th>
                  <th style={{ padding: '14px 12px', width: 180 }}>Action</th>
                  <th style={{ padding: '14px 12px', width: 220 }}>Module</th>
                  <th style={{ padding: '14px 12px', width: 160 }}>IP Address</th>
                  <th style={{ padding: '14px 12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => {
                  const meta = l.meta || {}
                  const userName = meta.userName || meta.user || (meta.user_id ? `user ${meta.user_id}` : '—')
                  const avatar = meta.userAvatar || (meta.user && meta.user.avatar) || null
                  // prefer normalized action_type populated by backend; fallback to meta.action/event
                  const rawAction = (l.action_type && l.action_type.toString()) || meta.action || meta.event || (l.level || '').toUpperCase()
                  // humanize action label: sale_create -> Sale Create
                  const actionLabel = String(rawAction).replace(/[_\-\.]/g, ' ').replace(/(^|\s)\S/g, s => s.toUpperCase())
                  const moduleName = meta.module || meta.component || meta.source || ''
                  const ip = meta.ip || (meta.request && meta.request.ip) || ''
                  const created = new Date(l.created_at)
                  // badge color mapping by normalized action_type prefixes
                  const a = (String(rawAction || '')).toLowerCase()
                  let badgeColor = '#eef2ff'
                  let badgeTextColor = '#4f46e5'
                  if (a.includes('error') || a.includes('failed')) { badgeColor = '#ffdede'; badgeTextColor = '#c53030' }
                  else if (a.includes('create') || a.includes('sale') || a.includes('purchase')) { badgeColor = '#e6fffa'; badgeTextColor = '#059669' }
                  else if (a.includes('update') || a.includes('adjust')) { badgeColor = '#fff7ed'; badgeTextColor = '#b45309' }
                  return (
                    <tr key={l.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 700 }}>{created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>{created.toLocaleDateString()}</div>
                      </td>
                      <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        {avatar ? (
                          <img src={avatar} alt={userName} style={{ width: 40, height: 40, borderRadius: 999 }} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: 999, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(userName || 'U').charAt(0)}</div>
                        )}
                        <div>
                          <div style={{ fontWeight: 700 }}>{userName}</div>
                          <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>{meta.userRole || ''}</div>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ display: 'inline-block', padding: '6px 10px', borderRadius: 999, background: badgeColor, color: badgeTextColor, fontWeight: 700, fontSize: 13 }}>{actionLabel}</span>
                      </td>
                      <td style={{ padding: '12px' }}>{moduleName}</td>
                      <td style={{ padding: '12px' }}>{ip}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button className="btn" onClick={() => setSelectedLog(l)} style={{ padding: '6px 10px' }}>View</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal: show details for selected log */}
        {selectedLog && (
          <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedLog(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: '720px', maxWidth: '95%', background: 'white', borderRadius: 8, padding: 18, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Log details</h4>
                <button className="btn" onClick={() => setSelectedLog(null)}>Close</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><strong>Time</strong><div style={{ color: 'var(--color-muted)' }}>{new Date(selectedLog.created_at).toLocaleString()}</div></div>
                <div><strong>Action</strong><div style={{ color: 'var(--color-muted)' }}>{(selectedLog.action_type && selectedLog.action_type.toString()) || (selectedLog.meta && (selectedLog.meta.action || selectedLog.meta.event)) || selectedLog.level}</div></div>
                <div><strong>User</strong><div style={{ color: 'var(--color-muted)' }}>{(selectedLog.meta && (selectedLog.meta.userName || selectedLog.meta.user || (selectedLog.meta.user_id ? `user ${selectedLog.meta.user_id}` : '—'))) || '—'}</div></div>
                <div><strong>Module / IP</strong><div style={{ color: 'var(--color-muted)' }}>{(selectedLog.meta && (selectedLog.meta.module || selectedLog.meta.component || selectedLog.meta.source)) || ''} {selectedLog.meta && selectedLog.meta.ip ? ` / ${selectedLog.meta.ip}` : ''}</div></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong>Message</strong>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 6, whiteSpace: 'pre-wrap' }}>{selectedLog.message || ''}</div>
              </div>
              <div>
                <strong>Meta</strong>
                <pre style={{ background: '#0f172a', color: '#e6eef8', padding: 12, borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>{selectedLog.meta ? JSON.stringify(selectedLog.meta, null, 2) : '{}'}</pre>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ color: 'var(--color-muted)' }}>Total: {total}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            <div>Page {page} / {totalPages}</div>
            <button className="btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}
