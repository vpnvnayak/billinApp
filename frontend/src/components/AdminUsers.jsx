import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { PencilIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [entries, setEntries] = useState(10)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchUsers() }, [])

  function fetchUsers() {
    api.get('/users').then(r => setUsers(r.data)).catch(console.error)
  }

  function addRole(userId, role) {
    if (!role) return
  api.post(`/users/${userId}/roles`, { role }).then(() => fetchUsers()).catch(err => { console.error(err); import('../services/ui').then(m => m.showAlert(err?.response?.data?.error || 'Failed to add role')) })
  }

  function removeRole(userId, role) {
    import('../services/ui').then(async m => {
      const ok = await m.showConfirm(`Remove role "${role}" from user ${userId}?`)
      if (!ok) return
      api.delete(`/users/${userId}/roles/${encodeURIComponent(role)}`).then(() => fetchUsers()).catch(err => { console.error(err); import('../services/ui').then(mm => mm.showAlert('Failed to remove role')) })
    })
  }

  const filtered = (() => {
    const q = (search || '').trim().toLowerCase()
    let res = users
    if (q) res = users.filter(u => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
    const start = ((page || 1) - 1) * (entries || 10)
    return res.slice(start, start + (entries || 10))
  })()

  return (
    <div className="admin-users">
      <div style={{ marginBottom: 8 }}>
  <ListControls searchValue={search} onSearchChange={v => { setSearch(v); setPage(1) }} />
      </div>
  <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>SI No</th>
              <th>Name</th>
              <th>User Name</th>
              <th>Password</th>
              <th>Printer</th>
              <th>Bill Seies</th>
              <th>LC</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
      {filtered.map((u, idx) => (
              <tr key={u.id}>
        <td>{idx + 1}</td>
                <td>{u.full_name || u.email}</td>
                <td>{u.email}</td>
                <td>••••••••</td>
                <td>thermal</td>
                <td>-</td>
                <td>
                  <label className={`lc-toggle ${u.active ? 'active' : 'inactive'}`}>
                    <input type="checkbox" checked={!!u.active} readOnly />
                    <span>{u.active ? 'Active' : 'Inactive'}</span>
                  </label>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn small" title="Edit"><PencilIcon style={{ width: 16, height: 16 }} /></button>
                    <button className="btn small danger" title="Block"><XMarkIcon style={{ width: 16, height: 16 }} /></button>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 6 }}>
                      {u.roles && u.roles.length ? u.roles.map(r => (
                        <span key={r} className="role-chip">{r} <button className="x" onClick={() => removeRole(u.id, r)} title={`Remove ${r}`}><XMarkIcon style={{ width: 12, height: 12 }} /></button></span>
                      )) : <em>No roles</em>}
                    </div>
                    <AddRoleInline userId={u.id} onAdded={() => fetchUsers()} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationFooter total={users.length} page={page} pageSize={entries} onPageChange={p => setPage(p)} onPageSizeChange={s => { setEntries(s); setPage(1) }} />
      </div>
    </div>
  )
}

function AddRoleInline({ userId, onAdded }) {
  const [val, setVal] = useState('')
  function submit(e) {
    e.preventDefault()
    if (!val) return
    addRoleLocal()
  }
  function addRoleLocal() {
  api.post(`/users/${userId}/roles`, { role: val }).then(() => { setVal(''); onAdded() }).catch(err => { console.error(err); import('../services/ui').then(m => m.showAlert(err?.response?.data?.error || 'Failed to add role')) })
  }
  return (
      <form onSubmit={submit} style={{ display: 'flex', gap: 6 }}>
      <input value={val} onChange={e => setVal(e.target.value)} placeholder="role to add" />
      <button type="button" className="btn" onClick={addRoleLocal} title="Add role"><PlusIcon style={{ width: 14, height: 14 }} /></button>
    </form>
  )
}
