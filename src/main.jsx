import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { startEarlyPatientViewFetch } from './lib/patientViewEarlyFetch.js'

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
  </React.StrictMode>,
)