import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const certDir = path.resolve(process.cwd(), 'certs')
const certFile = path.join(certDir, 'localhost.pem')
const keyFile = path.join(certDir, 'localhost-key.pem')

export default defineConfig(({ command }) => {
  const isDev = command === 'serve'

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0', // 👈 important for Render
      port: parseInt(process.env.PORT) || 5173,
      https:
        isDev && fs.existsSync(certFile) && fs.existsSync(keyFile)
          ? {
              cert: fs.readFileSync(certFile),
              key: fs.readFileSync(keyFile),
            }
          : false,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0', // 👈 also needed if using `vite preview` on Render
      port: parseInt(process.env.PORT) || 5173,
    },
  }
})
