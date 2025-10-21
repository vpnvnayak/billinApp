import axios from 'axios'
import { setToken } from './localStore'

// Determine API base: prefer Vite env, else derive from current page origin and port 4000
const viteBase = import.meta.env.VITE_API_BASE
const base = viteBase || `${window.location.protocol}//${window.location.hostname}:4000/api`

const api = axios.create({
  baseURL: base,
  withCredentials: true // send cookies for refresh flow
})

// attach Authorization header
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('token')
  if (t) cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${t}` }
  return cfg
})

// Response interceptor to handle 401 -> try refresh once
let isRefreshing = false
let refreshQueue = []

function processQueue(error, token = null) {
  refreshQueue.forEach(p => {
    if (error) p.reject(error)
    else p.resolve(token)
  })
  refreshQueue = []
}

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config
    if (err.response && err.response.status === 401 && !original._retry) {
      original._retry = true
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }
      isRefreshing = true
      try {
        // Try cookie-based refresh first (server reads HttpOnly cookie)
        let resp = null
        try {
          resp = await axios.post(`${base}/auth/refresh`, {}, { withCredentials: true })
        } catch (e) {
          // ignore and fallback to devRefreshToken
        }
        if (!resp || !resp.data || !resp.data.token) {
          const stored = localStorage.getItem('devRefreshToken')
          if (stored) {
            resp = await axios.post(`${base}/auth/refresh`, { refreshToken: stored }, { withCredentials: false })
          }
        }
        const newToken = resp && resp.data && resp.data.token
        if (!newToken) throw new Error('refresh failed')
        setToken(newToken)
        processQueue(null, newToken)
        isRefreshing = false
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (e) {
        processQueue(e, null)
        isRefreshing = false
        // clear tokens
        localStorage.removeItem('token')
        localStorage.removeItem('devRefreshToken')
        localStorage.removeItem('refreshToken')
        return Promise.reject(e)
      }
    }
    return Promise.reject(err)
  }
)

export function setTokenLocal(token) {
  if (token) localStorage.setItem('token', token)
  else localStorage.removeItem('token')
}



export default api
