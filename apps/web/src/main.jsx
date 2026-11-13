import React from 'react'
import ReactDOM from 'react-dom/client'
import ErrorBoundary from '@/components/ErrorBoundary'
import { reportError } from '@/api/base44Client'
import '@fontsource-variable/bricolage-grotesque/wght.css'
import '@fontsource-variable/figtree/wght.css'
import '@/index.css'
import { registerPwa } from '@/lib/pwa'

// Erros fora das telas (rede, promessas sem tratamento) também são registrados.
window.addEventListener('error', (e) => reportError(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => reportError(e.reason))

// Mesmo sistema visual em todos os produtos; o App do Cliente tem ajustes próprios (classe tema-cliente),
// os painéis do comerciante e do admin são mais densos (classe painel).
if (['admin', 'parceiro'].includes(import.meta.env.VITE_APP)) document.documentElement.classList.add('painel')
else if (import.meta.env.VITE_APP !== 'entregador') document.documentElement.classList.add('tema-cliente')
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', import.meta.env.VITE_APP === 'entregador' ? '#14201A' : '#0B6B43')

// Cada site gera só o seu produto (VITE_APP vem do modo: cliente, parceiro, admin ou entregador).
const load =
  import.meta.env.VITE_APP === 'admin' ? () => import('@/apps/admin/AdminApp')
  : import.meta.env.VITE_APP === 'parceiro' ? () => import('@/apps/parceiro/ParceiroApp')
  : import.meta.env.VITE_APP === 'entregador' ? () => import('@/apps/entregador/EntregadorApp')
  : () => import('@/apps/cliente/ClienteApp')

// Cliente e Entregador são PWA instaláveis. Versão nova: faixa no rodapé com "Atualizar".
if (['cliente', 'entregador', undefined].includes(import.meta.env.VITE_APP)) {
  registerPwa((activate) => {
    const bar = document.createElement('div')
    bar.setAttribute('role', 'status')
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:9999;background:#1F4D3A;color:#fff;border-radius:16px;padding:12px 16px;display:flex;gap:12px;align-items:center;font:15px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.2)'
    bar.innerHTML = '<span style="flex:1">Nova versão disponível.</span><button style="height:40px;padding:0 16px;border-radius:999px;border:0;background:#fff;color:#1F4D3A;font-weight:600">Atualizar</button>'
    bar.querySelector('button').onclick = activate
    document.body.appendChild(bar)
  })
}
// Sem conexão: aviso fixo (pedidos e pagamentos só com o servidor respondendo).
const net = () => {
  let el = document.getElementById('aviso-offline')
  if (navigator.onLine) { el?.remove(); return }
  if (el) return
  el = document.createElement('div')
  el.id = 'aviso-offline'; el.setAttribute('role', 'alert')
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#7A3A1F;color:#fff;text-align:center;padding:8px;font:14px system-ui'
  el.textContent = 'Sem internet. Pedidos e pagamentos ficam pausados até a conexão voltar.'
  document.body.appendChild(el)
}
window.addEventListener('online', net); window.addEventListener('offline', net)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', net); else net()

load().then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
})
