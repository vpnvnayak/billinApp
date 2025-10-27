import React from 'react'

export default function Reports() {
  return (
    <div className="reports-page">
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Reports</h2>
        <div style={{ marginTop: 8, color: 'var(--color-muted)' }}>Quick access to sales, purchases and inventory reports.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
        <div className="card">
          <h3>Sales Report</h3>
          <p className="muted">Daily / weekly sales summary. Click to view details.</p>
          <div style={{ textAlign: 'right' }}><a href="#" onClick={(e) => { e.preventDefault(); if (window.__appNavigate) window.__appNavigate('/sales') }}>Open</a></div>
        </div>
        <div className="card">
          <h3>Purchases Report</h3>
          <p className="muted">Recent purchases and supplier aggregates.</p>
          <div style={{ textAlign: 'right' }}><a href="#" onClick={(e) => { e.preventDefault(); if (window.__appNavigate) window.__appNavigate('/purchases') }}>Open</a></div>
        </div>
        <div className="card">
          <h3>Inventory Report</h3>
          <p className="muted">Low stock, critical items and stock valuation.</p>
          <div style={{ textAlign: 'right' }}><a href="#" onClick={(e) => { e.preventDefault(); if (window.__appNavigate) window.__appNavigate('/products?filter=low_stock') }}>Open</a></div>
        </div>
      </div>
    </div>
  )
}
