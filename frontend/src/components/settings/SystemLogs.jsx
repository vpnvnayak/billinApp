import React from 'react'

export default function SystemLogs() {
  return (
    <div>
      <h3>System Logs</h3>
      <p>View recent system events and errors.</p>
      <div style={{ maxHeight: 320, overflow: 'auto', background: '#0b0b0b', color: '#cfcfcf', padding: 12, borderRadius: 6 }}>
        <pre style={{ margin: 0 }}>No logs to show (placeholder)</pre>
      </div>
    </div>
  )
}
