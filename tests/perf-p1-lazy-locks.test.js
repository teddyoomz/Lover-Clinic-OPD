// perf P1 (2026-07-06) — regression locks for the bundle/load phase.
// Locks the LAZY-IMPORT + config contracts so a future edit can't silently
// re-eager a heavy chunk or drop the load-path wins. Plan:
// docs/superpowers/plans/2026-07-06-performance-audit-optimization.html (T7 Step 2).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.jsx', 'utf8');
const admin = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
const backend = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');
const vercel = readFileSync('vercel.json', 'utf8');
const viteCfg = readFileSync('vite.config.js', 'utf8');

describe('P1.1 — recall manualChunk bucket stays removed', () => {
  it('vite.config has NO recall chunk return (it absorbed firebase+backendClient → 903KB preloaded everywhere)', () => {
    expect(viteCfg).not.toMatch(/return 'recall'/);
  });
  it('vendor pins for react/firebase/icons/fabric remain', () => {
    for (const v of ['vendor-react', 'vendor-firebase', 'vendor-icons', 'vendor-fabric']) {
      expect(viteCfg).toContain(`return '${v}'`);
    }
  });
});

describe('P1.2 — BackendDashboard heavy tabs + TFP lazy', () => {
  it.each(['SaleTab', 'StockTab', 'FinanceTab', 'CustomerListTab', 'CustomerDetailView',
    'AppointmentCalendarView', 'ProductsTab', 'CoursesTab', 'StaffTab'])('%s is lazy (no static import)', (name) => {
    expect(backend).not.toMatch(new RegExp(`import ${name} from`));
    expect(backend).toMatch(new RegExp(`${name} = lazy\\(`));
  });
  it('TreatmentFormPage lazy in BOTH dashboards + Suspense at overlays', () => {
    for (const src of [backend, admin]) {
      expect(src).not.toMatch(/import TreatmentFormPage from/);
      expect(src).toMatch(/TreatmentFormPage = lazy\(/);
    }
    // overlay render sites carry their own Suspense (outside the tab boundary)
    expect(backend).toMatch(/perf P1\.2 — own Suspense/);
    expect(admin).toMatch(/perf P1\.2 — lazy TFP/);
  });
});

describe('P1.3 — App.jsx entry slimmed', () => {
  it('PatientForm + PrintTemplates lazy (entry chunk was 365KB carrying them)', () => {
    expect(app).not.toMatch(/import PatientForm from/);
    expect(app).not.toMatch(/import \{ OfficialOPDPrint/);
    expect(app).toMatch(/PatientForm = lazy\(/);
    expect(app).toMatch(/OfficialOPDPrint = lazy\(/);
    expect(app).toMatch(/DashboardOPDPrint = lazy\(/);
  });
  it('simulation PatientForm has a NESTED Suspense (protects always-mounted AdminDashboard)', () => {
    expect(app).toMatch(/NESTED Suspense so a suspending lazy PatientForm/);
  });
});

describe('P1.4 — AdminDashboard heavy children lazy; ChatPanel intentionally static', () => {
  it.each(['AppointmentHubView', 'ClinicSettingsPanel', 'CustomFormBuilder', 'TreatmentTimeline',
    'AppointmentFormModal'])('%s is lazy', (name) => {
    expect(admin).not.toMatch(new RegExp(`^import ${name} from`, 'm'));
    expect(admin).toMatch(new RegExp(`${name} = lazy\\(`));
  });
  it('ChatPanel stays static — its named exports (useChatUnread + sounds) are top-level consumed (P2 #13 splits it)', () => {
    expect(admin).toMatch(/import ChatPanel, \{ useChatUnread, playAlertSound, playChatNotificationSound \}/);
  });
});

describe('P1.5/P1.6 — load-path config', () => {
  it('vercel.json serves hashed /assets/* immutable', () => {
    const j = JSON.parse(vercel);
    const assets = j.headers.find((h) => h.source === '/assets/(.*)');
    expect(assets.headers[0]).toEqual({ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' });
  });
  it('index.html preconnects the 4 Firebase origins', () => {
    for (const origin of ['identitytoolkit.googleapis.com', 'firestore.googleapis.com',
      'firebasestorage.googleapis.com', 'www.googleapis.com']) {
      expect(indexHtml).toMatch(new RegExp(`preconnect" href="https://${origin.replace(/\./g, '\\.')}"`));
    }
  });
});

describe('P1.9/P1.11 — config hygiene', () => {
  it('vite warmup has no V50-deleted files', () => {
    for (const dead of ['AppointmentTab.jsx', 'MasterDataTab.jsx', 'CloneTab.jsx']) {
      expect(viteCfg).not.toContain(dead);
    }
  });
  it('FOUC body{opacity:0} rule removed BUT both CSP-hashed inline scripts untouched', () => {
    expect(indexHtml).not.toMatch(/body\s*\{\s*opacity:\s*0/);
    // these two inline scripts' sha256 are pinned in vercel.json CSP script-src —
    // if either changes, prod scripts get BLOCKED. Lock their key statements.
    expect(indexHtml).toContain("document.body.classList.add('ready');");
    expect(indexHtml).toContain("localStorage.getItem('app-theme') || 'dark'");
  });
});
