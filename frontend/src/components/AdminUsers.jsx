import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import ListControls from './ui/ListControls'
import PaginationFooter from './ui/PaginationFooter'
import { isValidEmail, isValidPhone } from '../utils/validation'

export default function AdminUsers({ user }) {
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ id: null, username: '', email: '', phone: '', password: '', confirm: '', roles: ['cashier'] })
  const [showModal, setShowModal] = useState(false)
  const [rolesList, setRolesList] = useState([])
  const [entries, setEntries] = useState(10)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)

  useEffect(() => { fetchUsers() }, [page, entries])
  useEffect(() => {
    // fetch available roles for the dropdown
    api.get('/roles').then(r => setRolesList(r.data)).catch(() => setRolesList([]))
  }, [])

  async function fetchUsers() {
    try {
      const r = await api.get('/users', { params: { page, limit: entries } })
      if (r && r.data) {
        if (Array.isArray(r.data)) {
          setUsers(r.data)
          setTotal(r.data.length)
        } else if (Array.isArray(r.data.data)) {
          setUsers(r.data.data)
          setTotal(r.data.total || 0)
        } else {
          setUsers(r.data)
          setTotal((r.data && r.data.length) || 0)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  // role add/remove moved into modal; inline add removed

  async function createUser(e) {
    e && e.preventDefault()
  const { id, username, email, phone, password, confirm, roles } = newUser || {}
  if (!username || !email) return import('../services/ui').then(m => m.showAlert('username and email required'))
  if (!isValidEmail(email)) return import('../services/ui').then(m => m.showAlert('Invalid email'))
  if (phone && !isValidPhone(phone)) return import('../services/ui').then(m => m.showAlert('Invalid phone'))
  if (!roles || !roles.length) return import('../services/ui').then(m => m.showAlert('select at least one role'))
  // client-side guard: only superadmin or storeadmin may assign storeadmin
  const isSuper = user && Array.isArray(user.roles) && user.roles.includes('superadmin')
  const isStoreAdmin = user && Array.isArray(user.roles) && user.roles.includes('storeadmin')
  if (roles.includes('storeadmin') && !(isSuper || isStoreAdmin)) return import('../services/ui').then(m => m.showAlert('Only superadmin or storeadmin can assign the storeadmin role'))
  // password required and must match
  if (!id) {
    // creating new user requires password
    if (!password) return import('../services/ui').then(m => m.showAlert('password is required'))
    if (password !== confirm) return import('../services/ui').then(m => m.showAlert('password and confirm password do not match'))
    if (password.length < 6) return import('../services/ui').then(m => m.showAlert('password must be at least 6 characters'))
  } else {
    // editing: if password provided, validate confirm
    if (password) {
      if (password !== confirm) return import('../services/ui').then(m => m.showAlert('password and confirm password do not match'))
      if (password.length < 6) return import('../services/ui').then(m => m.showAlert('password must be at least 6 characters'))
    }
  }
    try {
    if (!id) {
      // create
      const payload = { username, email, phone, password, roles }
      const r = await api.post('/users', payload)
      const res = r.data || {}
      const pw = res.password || null
      await fetchUsers()
      setNewUser({ id: null, username: '', email: '', phone: '', password: '', confirm: '', roles: ['cashier'] })
      setShowModal(false)
  if (pw) import('../services/ui').then(m => m.showAlert(`User created. Temporary password: ${pw}`))
  else import('../services/ui').then(m => m.showSnackbar('User created', 'success'))
    } else {
      // update
      const payload = { username, email, phone }
      if (password) payload.password = password
      if (roles) payload.roles = roles
      await api.put(`/users/${id}`, payload)
      await fetchUsers()
      setNewUser({ id: null, username: '', email: '', phone: '', password: '', confirm: '', roles: ['cashier'] })
      setShowModal(false)
  import('../services/ui').then(m => m.showSnackbar('User updated', 'success'))
    }
    } catch (err) {
      console.error(err)
      import('../services/ui').then(m => m.showAlert(err?.response?.data?.error || 'Failed to create user'))
    }
  }

  // role remove moved into modal; inline remove removed

  // users is the server returned (paged) list. Apply client-side search only as a defensive fallback.
  const filtered = (() => {
    const q = (search || '').trim().toLowerCase()
    let res = users || []
    if (q) res = res.filter(u => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
    return res
  })()

  return (
    <div className="admin-users">
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <ListControls searchValue={search} onSearchChange={v => { setSearch(v); setPage(1) }} />
        </div>
        <div>
          <button className="btn" onClick={() => setShowModal(true)}>Create User</button>
        </div>
      </div>
      <div className="users-table-wrap">
  <table className="users-table">
          <thead>
            <tr>
              <th>SI No</th>
              <th>Name</th>
              <th>User Name</th>
              <th>Roles</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
      {filtered.map((u, idx) => (
              <tr key={u.id}>
        <td>{((page || 1) - 1) * (entries || 10) + idx + 1}</td>
                <td>{u.full_name || u.email}</td>
                <td>{u.email}</td>
                <td>
                  {u.roles && u.roles.length ? u.roles.join(', ') : <em>No roles</em>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn small" title="Edit" onClick={() => {
                      // open edit modal
                      setNewUser({ id: u.id, username: u.username || '', email: u.email || '', phone: u.phone || '', password: '', confirm: '', roles: Array.isArray(u.roles) ? u.roles : [] })
                      setShowModal(true)
                    }}><PencilIcon style={{ width: 16, height: 16 }} /></button>
                    <button className="btn small danger" title="Delete" onClick={() => {
                      import('../services/ui').then(async m => {
                        const ok = await m.showConfirm(`Delete user ${u.email}? This cannot be undone.`)
                        if (!ok) return
                        api.delete(`/users/${u.id}`).then(() => { fetchUsers(); import('../services/ui').then(mm => mm.showSnackbar('User deleted', 'success')) }).catch(err => { console.error(err); import('../services/ui').then(mm => mm.showAlert('Failed to delete user')) })
                      })
                    }}><TrashIcon style={{ width: 16, height: 16 }} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
  <PaginationFooter total={total} page={page} pageSize={entries} onPageChange={p => setPage(p)} onPageSizeChange={s => { setEntries(s); setPage(1) }} />
      </div>
      {showModal ? (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{newUser && newUser.id ? 'Edit user' : 'Create user'}</h3>
            </div>
            <div className="modal-grid">
              <div className="field">
                <div className="field-label">User ID (username)</div>
                <input value={newUser.username} onChange={e => setNewUser(s => ({ ...s, username: e.target.value }))} />
              </div>
              <div className="field">
                <div className="field-label">Email</div>
                <input value={newUser.email} onChange={e => setNewUser(s => ({ ...s, email: e.target.value }))} />
              </div>
              <div className="field">
                <div className="field-label">Phone</div>
                <input value={newUser.phone} onChange={e => setNewUser(s => ({ ...s, phone: e.target.value }))} />
              </div>
              <div className="field">
                <div className="field-label">Roles</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select multiple value={newUser.roles} onChange={e => {
                    const opts = Array.from(e.target.selectedOptions).map(o => o.value)
                    setNewUser(s => ({ ...s, roles: opts }))
                  }} style={{ minWidth: 180 }}>
                    {rolesList && rolesList.length ? rolesList.map(r => {
                      const name = r.name || r
                      const disabled = (name === 'storeadmin') && !(user && Array.isArray(user.roles) && user.roles.includes('superadmin'))
                      return <option key={name} value={name} disabled={disabled}>{name}</option>
                    }) : (
                      // fallback single options
                      <>
                        <option value="cashier">cashier</option>
                        <option value="storeadmin" disabled>storeadmin</option>
                      </>
                    )}
                  </select>
                  {/* show short help when storeadmin cannot be assigned */}
                  {rolesList && rolesList.some(r => r.name === 'storeadmin') && !(user && Array.isArray(user.roles) && user.roles.includes('superadmin')) ? (
                    <span className="muted" title="Only superadmin can assign the storeadmin role">Only superadmin can assign storeadmin</span>
                  ) : null}
                </div>
              </div>
              <div className="field">
                <div className="field-label">Password</div>
                <input type="password" value={newUser.password} onChange={e => setNewUser(s => ({ ...s, password: e.target.value }))} />
              </div>
              <div className="field">
                <div className="field-label">Confirm password</div>
                <input type="password" value={newUser.confirm} onChange={e => setNewUser(s => ({ ...s, confirm: e.target.value }))} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setShowModal(false); setNewUser({ id: null, username: '', email: '', phone: '', password: '', confirm: '', roles: ['cashier'] }) }}>Cancel</button>
              <button className="btn" onClick={createUser}>{newUser && newUser.id ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

