// ─── App Error Boundary (2026-07-19) ───────────────────────────────────────
// Turns a React render crash (previously a silent BLACK SCREEN — V80/V163
// class) into a recoverable Thai fallback + a beacon report. Wraps <App/> in
// main.jsx. Class component — error boundaries require one.
import React from 'react';
import { reportErrorToBeacon } from '../lib/errorBeacon.js';
import { isFirestoreInternalAssertion } from '../lib/clientErrorCore.js';
import { noteWedgeReload } from '../lib/wedgeEscalation.js';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, isAssertion: false };
  }

  static getDerivedStateFromError(error) {
    // Flag a Firestore INTERNAL ASSERTION crash so the reload below stamps the
    // wedge marker → a recurrence within the heal window escalates to a
    // memory-cache boot (drops the persistentMultipleTabManager trigger).
    return { crashed: true, isAssertion: isFirestoreInternalAssertion(error?.message) };
  }

  componentDidCatch(error) {
    // reportErrorToBeacon also routes the assertion into the wedge ladder
    // (escalation check) — the render-crash path mirrors the onerror path.
    try { reportErrorToBeacon(error, { source: 'react-boundary' }); } catch { /* silent */ }
  }

  handleReload = () => {
    // For an assertion crash, mark this as a wedge-reload so a recurrence on the
    // fresh boot escalates to memory-cache (AV214 ladder). User-initiated → no loop.
    if (this.state.isAssertion) { try { noteWedgeReload(); } catch { /* blocked storage */ } }
    try { window.location.reload(); } catch { /* noop — jsdom */ }
  };

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div
        data-testid="app-error-boundary-fallback"
        style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          background: '#0f0f0f', color: '#e5e5e5', textAlign: 'center', padding: '2rem',
          fontFamily: "'Noto Sans Thai', system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: '2.2rem' }}>😥</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>เกิดข้อผิดพลาดในการแสดงผล</div>
        <div style={{ fontSize: '0.85rem', color: '#a3a3a3' }}>
          ระบบบันทึกปัญหาไว้แล้ว กรุณาลองใหม่อีกครั้ง
        </div>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            marginTop: '0.5rem', padding: '0.55rem 1.4rem', borderRadius: '10px',
            border: '1px solid #dc2626', background: 'rgba(220,38,38,0.85)',
            color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
          }}
        >
          โหลดหน้าใหม่
        </button>
      </div>
    );
  }
}
