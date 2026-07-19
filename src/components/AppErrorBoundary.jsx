// ─── App Error Boundary (2026-07-19) ───────────────────────────────────────
// Turns a React render crash (previously a silent BLACK SCREEN — V80/V163
// class) into a recoverable Thai fallback + a beacon report. Wraps <App/> in
// main.jsx. Class component — error boundaries require one.
import React from 'react';
import { reportErrorToBeacon } from '../lib/errorBeacon.js';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error) {
    try { reportErrorToBeacon(error, { source: 'react-boundary' }); } catch { /* silent */ }
  }

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
          onClick={() => window.location.reload()}
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
