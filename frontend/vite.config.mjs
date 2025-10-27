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
    } : false,
    host: 'localhost',
    port: process.env.PORT ||5173,
    strictPort: true
  }
}))
