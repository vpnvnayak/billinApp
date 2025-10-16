import React from 'react'
import { useUI } from './UIProvider'

export default function StoreSwitcher() {
  const { availableStores = [], selectedStore, switchStore } = useUI() || {}
  if (!availableStores || availableStores.length <= 1) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label>
        <span className="sr-only">Select store</span>
        <select value={selectedStore ? selectedStore.id : (availableStores[0] && availableStores[0].id) || ''} onChange={e => {
          const id = e.target.value
          const s = availableStores.find(x => String(x.id) === String(id))
          if (s) switchStore(s)
        }} aria-label="Select store">
          {availableStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
    </div>
  )
}
