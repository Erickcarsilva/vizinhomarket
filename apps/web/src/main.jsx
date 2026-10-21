import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import { reportError } from '@/api/base44Client'
import '@/index.css'

// Erros fora das telas (rede, promessas sem tratamento) também são registrados.
window.addEventListener('error', (e) => reportError(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => reportError(e.reason))

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
