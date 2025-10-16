import React, { useEffect, useState } from 'react'
import api from '../services/api'

export default function Profile() {
  const [me, setMe] = useState(null)

  useEffect(() => {
    api.get('/auth/me').then(r => setMe(r.data)).catch(() => {})
  }, [])

  if (!me) return <div>Loading profile...</div>
  return (
    <div>
      <h3>Profile</h3>
      <div>Email: {me.email}</div>
      <div>Full name: {me.full_name}</div>
      <div>Roles: {me.roles?.join(', ')}</div>
    </div>
  )
}
