import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

async function clearServiceWorkerState() {
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map(registration => registration.unregister()))

  if ('caches' in window) {
    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map(key => caches.delete(key)))
  }
}

// Register service worker for PWA support, but disable it on Railway backend domains.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isRailwayHost = window.location.hostname.endsWith('.railway.app')

    if (isRailwayHost) {
      clearServiceWorkerState().catch(() => {})
      return
    }

    navigator.serviceWorker.register('/sw.js').then(registration => {
      registration.update().catch(() => {})
    }).catch(() => {})
  })
}
