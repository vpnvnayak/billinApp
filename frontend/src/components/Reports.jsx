import React, { useState } from 'react'

const REPORTS = [
  { id: 'sales', title: 'Sales', description: 'Daily / weekly sales summary. Click to view details.', to: '/sales' },
  { id: 'purchases', title: 'Purchases', description: 'Recent purchases and supplier aggregates.', to: '/purchases' },
  { id: 'inventory', title: 'Inventory', description: 'Low stock, critical items and stock valuation.', to: '/products?filter=low_stock' }
]

export default function Reports() {
  const [active, setActive] = useState(REPORTS[0].id)

  return (
    <div className="reports-page">
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Reports</h2>
        <div style={{ marginTop: 8, color: 'var(--color-muted)' }}>Quick access to sales, purchases and inventory reports.</div>
      </div>

      <div className="reports-tabs" style={{ marginTop: 12 }}>
        <div className="tabs">
          {REPORTS.map(r => (
            <button
              key={r.id}
              className={`tab-button ${active === r.id ? 'active' : ''}`}
              onClick={() => setActive(r.id)}
            >
              {r.title}
            </button>
          ))}
        </div>

        <div className="reports-content" style={{ marginTop: 12 }}>
          {REPORTS.map(r => (
            <div key={r.id} style={{ display: active === r.id ? 'block' : 'none' }} className="card">
              <h3>{r.title} Report</h3>
              <p className="muted">{r.description}</p>
              <div style={{ textAlign: 'right' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); if (window.__appNavigate) window.__appNavigate(r.to) }}>Open</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
