import React from 'react'
import ReactDOM from 'react-dom/client'
import ErrorBoundary from '@/components/ErrorBoundary'
import { reportError } from '@/api/base44Client'
import '@/index.css'

// Erros fora das telas (rede, promessas sem tratamento) também são registrados.
window.addEventListener('error', (e) => reportError(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => reportError(e.reason))

// Cada site gera só o seu produto (VITE_APP vem do modo: cliente, parceiro ou admin).
const load =
  import.meta.env.VITE_APP === 'admin' ? () => import('@/apps/admin/AdminApp')
  : import.meta.env.VITE_APP === 'parceiro' ? () => import('@/apps/parceiro/ParceiroApp')
  : () => import('@/apps/cliente/ClienteApp')

load().then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
})
