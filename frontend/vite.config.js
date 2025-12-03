import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const certDir = path.resolve(process.cwd(), 'certs')
const certFile = path.join(certDir, 'localhost.pem')
const keyFile = path.join(certDir, 'localhost-key.pem')

export default defineConfig(({ command, mode }) => ({
  plugins: [react()],
  server: {
    https: fs.existsSync(certFile) && fs.existsSync(keyFile) ? {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile), 
      allowedHosts: true
    } : false,
    host: 'localhost',
    port: process.env.PORT || 5173,
    // fail if 5173 is busy — we want the dev server to run on 5173 only
    strictPort: true,
    // allowlist additional hosts used by previews / deploy targets
    // Add the Render host that reported being blocked so HMR/previews work there
    allowedHosts: [
      'frontend-5ocj.onrender.com',
      'localhost',
      '127.0.0.1'
    ]
  }
}))
