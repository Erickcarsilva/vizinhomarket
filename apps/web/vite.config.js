import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// Três produtos saem do mesmo código. Cada um tem a sua porta no computador:
//   cliente 5173 · parceiro (painel do comerciante) 5174 · admin 5175
const PORTS = { cliente: 5173, parceiro: 5174, admin: 5175 }

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: true, port: PORTS[mode] || 5173, strictPort: true },
  preview: { host: true, port: (PORTS[mode] || 5173) - 1000 },
}))
