import React, { useState } from 'react'

function buildPageRange(page, totalPages) {
  // return array of items: numbers or '...'
  const delta = 2
  const range = []
  const left = Math.max(1, page - delta)
  const right = Math.min(totalPages, page + delta)
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= left && i <= right)) {
      range.push(i)
    } else if (range[range.length - 1] !== '...') {
      range.push('...')
    }
  }
  return range
}

export default function PaginationFooter({ total = 0, page = 1, pageSize = 10, onPageChange = () => {}, onPageSizeChange = () => {} }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 10)))
  const [input, setInput] = useState('')
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1
  const end = Math.min(total, page * pageSize)
  const pages = buildPageRange(page, totalPages)

  function goToInput() {
    const p = Number(input)
    if (!Number.isFinite(p)) return
    onPageChange(Math.max(1, Math.min(totalPages, p)))
    setInput('')
  }

  return (
    <div className="table-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
      <div style={{ color: 'var(--color-muted)' }}>
        Showing {start} to {end} of {total} entries
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div>
          <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={{ padding: '6px' }}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <button className="btn" onClick={() => onPageChange(Math.max(1, 1))} disabled={page <= 1}>Previous</button>
        {pages.map((p, idx) => (
          p === '...' ? (
            <span key={"e"+idx} style={{ padding: '6px 10px', color: '#999' }}>…</span>
          ) : (
            <button key={p} className={`btn small ${p === page ? 'active' : ''}`} onClick={() => onPageChange(p)}>{p}</button>
          )
        ))}
        <button className="btn" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Next</button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Page" style={{ width: 64, padding: '6px 8px' }} />
          <button className="btn" onClick={goToInput}>Go</button>
        </div>
      </div>
    </div>
  )
}
