import React, { useState } from 'react'
import api from '../services/api'
import { setToken } from '../services/localStore'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    try {
      const res = await api.post('/auth/login', { email, password })
      const { token, user } = res.data
      // server sets refresh token cookie (HttpOnly)
      setToken(token)
      // optionally persist a 'remember' flag locally (not storing tokens here)
      try { localStorage.setItem('rememberMe', remember ? '1' : '0') } catch (e) {}
      onLogin(user)
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed')
    }
  }

  return (
    <div className="login-outer">
      <div className="login-card" role="region" aria-label="Sign in to DinoPos">
        <div className="login-brand">
          <div className="logo" aria-hidden>DP</div>
          <div>
            <h1>DinoPos</h1>
          </div>
        </div>

        <form onSubmit={submit} className="login-form" aria-describedby="login-error">
          {error && <div id="login-error" className="error">{error}</div>}

          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              aria-required="true"
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div className="password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                aria-required="true"
              />
              <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(s => !s)}>
                {showPassword ? <EyeSlashIcon style={{ width: 18, height: 18 }} aria-hidden /> : <EyeIcon style={{ width: 18, height: 18 }} aria-hidden />}
              </button>
            </div>
          </label>

          <div className="login-row">
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember me
            </label>
            <a className="forgot" href="#">Forgot?</a>
          </div>

          <div className="login-actions">
            <button type="submit" className="btn primary">Sign in</button>
          </div>

        </form>

        <div className="login-foot">
          <small>Need an account? <a href="#" onClick={(e) => { e.preventDefault(); if (window.__appNavigate) return window.__appNavigate('/register'); try { window.history.pushState(null, '', '/register') } catch (err) {} window.dispatchEvent(new CustomEvent('navigate', { detail: '/register' })) }}>Register</a>.</small>
        </div>
      </div>
    </div>
  )
}
