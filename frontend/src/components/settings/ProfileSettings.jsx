import React from 'react'

export default function ProfileSettings() {
  return (
    <div>
      <h3>Profile settings</h3>
      <p>Update your name, email and password here.</p>
      <div style={{ maxWidth: 640 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>Display name</label>
        <input className="input" style={{ width: '100%', marginBottom: 12 }} placeholder="Your name" />
        <label style={{ display: 'block', marginBottom: 8 }}>Email</label>
        <input className="input" style={{ width: '100%', marginBottom: 12 }} placeholder="you@example.com" />
        <button className="btn">Save profile</button>
      </div>
    </div>
  )
}
