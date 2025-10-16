import React from 'react'

export default function ListControls({ searchValue, onSearchChange }) {
  return (
    <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
      <input value={searchValue} onChange={e => onSearchChange(e.target.value)} placeholder="Search" />
    </div>
  )
}
