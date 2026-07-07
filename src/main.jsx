import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { startEarlyPatientViewFetch } from './lib/patientViewEarlyFetch.js'
import SwUpdateToast from './components/SwUpdateToast.jsx'
import { registerSW } from 'virtual:pwa-register'

// D1 (2026-07-07 instant cold-start, spec Q4=B / AV207) — app-shell SW.
// Registered from the BUNDLE (CSP script-src 'self'-safe; the pinned inline
// hashes in vercel.json stay untouched). Prod-only: dev server has no sw.js
// and a dev SW would poison HMR. Update flow: check on every visibilitychange
// → onNeedRefresh → SwUpdateToast (tap-to-refresh + auto-apply when hidden).
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  const updateSW = registerSW({
    onNeedRefresh() {
      window.__swUpdate = updateSW
      window.dispatchEvent(new CustomEvent('sw-need-refresh'))
    },
    onRegisteredSW(_url, reg) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg?.update().catch(() => {})
      })
    },
  })
}

// perf link-patient LCP (2026-07-07): the ?patient= page's data comes from
// /api/patient-view (no Firebase auth / settings needed) but its consumer only
// mounts after the anon-auth gate + lazy chunk. Start the fetch NOW so the
// serverless call runs in parallel with everything else.
// Deliberately NO warm import() of PatientDashboard here: a failed dynamic
// module fetch at entry time (flaky mobile radio — this page's exact audience)
// is cached in the browser's module map (iOS Safari especially), which would
// make React.lazy's later import of the SAME chunk insta-reject → black screen
// with no error boundary. The API call dominates LCP; the chunk download fits
// inside its window, so warming buys ~nothing and adds that failure mode.
const earlyPatientToken = new URLSearchParams(window.location.search).get('patient')
if (earlyPatientToken) {
  startEarlyPatientViewFetch(earlyPatientToken)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <SwUpdateToast />
  </React.StrictMode>,
)