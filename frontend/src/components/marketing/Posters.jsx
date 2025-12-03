import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import CreatePosterModal from './CreatePosterModal'
import EditPosterModal from './EditPosterModal'

export default function Posters() {
  const [posters, setPosters] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingPosterId, setEditingPosterId] = useState(null)
  const [viewingPoster, setViewingPoster] = useState(null)

  async function load() {
    try {
      setLoading(true)
      const r = await api.get('/marketing/posters')
      setPosters(r.data || [])
    } catch (e) {
      console.error('Failed to load posters', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const placeholder = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect fill='#f3f4f6' width='100%' height='100%'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9ca3af' font-size='24'>No preview</text></svg>")

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ marginTop: 0 }}>Posters</h3>
        <div>
          <button className="btn primary" onClick={() => setShowModal(true)}>Create Poster</button>
        </div>
      </div>
      <div style={{ color: 'var(--color-muted)', marginTop: 8 }}>Create and manage promotional posters for in-store and social sharing.</div>

      <div style={{ marginTop: 16 }}>
        {loading ? <div>Loading…</div> : null}
        {!loading && posters.length === 0 ? <div style={{ color: 'var(--color-muted)' }}>No posters yet. Click "Create Poster" to add one.</div> : null}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          {posters.map(p => (
            <div key={p.id} className="card" style={{ width: 220, padding: 8 }}>
              <div style={{ height: 140, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setViewingPoster(p)}>
                {p.templates && p.templates[0] ? (() => {
                  const u = p.templates[0].url || ''
                  const src = (u.startsWith('http') || u.startsWith('//') || u.startsWith('/')) ? u : `/${u}`
                  return <img src={src} alt={p.title} style={{ maxWidth: '100%', maxHeight: '100%' }} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = placeholder }} />
                })() : <div style={{ color: 'var(--color-muted)' }}>No preview</div>}
              </div>
              <div style={{ marginTop: 8 }}><strong>{p.title}</strong></div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{new Date(p.created_at).toLocaleString()}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => setViewingPoster(p)}>View</button>
                <button className="btn" onClick={() => setEditingPosterId(p.id)}>Edit</button>
                <button className="btn" onClick={async () => { if (!confirm('Delete this poster?')) return; try { await api.delete(`/marketing/posters/${p.id}`); load() } catch(e){ alert('Delete failed') } }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {showModal ? <CreatePosterModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); load() }} /> : null}
      {editingPosterId ? <EditPosterModal posterId={editingPosterId} onClose={() => setEditingPosterId(null)} onUpdated={() => { setEditingPosterId(null); load() }} /> : null}

      {viewingPoster ? (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{viewingPoster.title}</h3>
              <button className="btn btn-ghost" onClick={() => setViewingPoster(null)}>Close</button>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(viewingPoster.templates || []).map(t => {
                  const u = t.url || ''
                  const src = (u.startsWith('http') || u.startsWith('//') || u.startsWith('/')) ? u : `/${u}`
                  return (
                    <div key={t.url} style={{ width: 280, height: 360, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={src} style={{ maxWidth: '100%', maxHeight: '100%' }} alt={viewingPoster.title} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = placeholder }} />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
