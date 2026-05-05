// Phase 20.0 Flow B — deposit booking modal options on be_*.
// Q4 calibrated test depth (Rule I a + c + d): pure simulate of options
// builder + source-grep regression guards. preview_eval (b) + lifecycle (e)
// deferred to Phase 5 (when patient submit lands the be_customers + be_deposits
// integration that closes the rest of the deposit-sync workflow).
//
// Phase 4 scope is bounded: replace broker.getDepositOptions (which scraped
// ProClinic) with be_* parallel reads + static payment methods. The
// downstream broker.submitDeposit / updateDeposit / cancelDeposit calls
// remain (Phase 5 scope — patient submit + customer create rewire closes
// them as a unit).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN_DASHBOARD = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const STRIPPED = ADMIN_DASHBOARD
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Phase 20.0 Flow B — B1 broker.getDepositOptions removed', () => {
  it('B1.1 — no broker.getDepositOptions call remains', () => {
    expect(STRIPPED).not.toMatch(/broker\.getDepositOptions\s*\(/);
  });

  it('B1.2 — fetchDepositOptions handler still defined (rebuilt with be_* sources)', () => {
    expect(STRIPPED).toMatch(/fetchDepositOptions\s*=/);
  });
});

describe('Phase 20.0 Flow B — B2 be_* sources wired', () => {
  it('B2.1 — listExamRooms imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*listExamRooms[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('B2.2 — listAllSellers imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*listAllSellers[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('B2.3 — TIME_SLOTS imported from staffScheduleValidation (Phase 19.0 canonical 15-min)', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*TIME_SLOTS\s+as\s+CANONICAL_TIME_SLOTS[^}]*\}\s*from\s*['"][^'"]*staffScheduleValidation/s,
    );
  });

  it('B2.4 — fetchDepositOptions calls Promise.all with [listDoctors, listStaff, listExamRooms, listAllSellers]', () => {
    expect(STRIPPED).toMatch(/Promise\.all\s*\(\s*\[\s*listDoctors\s*\(\s*\)/);
    expect(STRIPPED).toMatch(/listStaff\s*\(\s*\)/);
    expect(STRIPPED).toMatch(/listExamRooms\s*\(\s*\)/);
    expect(STRIPPED).toMatch(/listAllSellers\s*\(\s*\)/);
  });
});

describe('Phase 20.0 Flow B — B3 fetchDepositOptions builds same shape as broker version', () => {
  // Pure-helper simulate of the options-builder logic. Mirrors the builder
  // inside fetchDepositOptions so tests can verify shape correctness without
  // mounting React.

  const PAYMENT_METHODS = [
    { value: 'cash', label: 'เงินสด' },
    { value: 'transfer', label: 'โอน' },
    { value: 'credit', label: 'บัตรเครดิต' },
    { value: 'debit', label: 'บัตรเดบิต' },
    { value: 'qr', label: 'QR Code' },
  ];
  const SOURCES = [
    { value: 'walk-in', label: 'Walk-in' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'line', label: 'LINE' },
    { value: 'referral', label: 'แนะนำ' },
    { value: 'other', label: 'อื่นๆ' },
  ];
  const TIME_SLOTS = ['08:15', '08:30', '08:45'];

  function buildOptions({ doctors, staff, rooms, sellers, timeSlots }) {
    const timeOptions = timeSlots.map(t => ({ value: t, label: t }));
    return {
      paymentMethods: [...PAYMENT_METHODS],
      sellers: (sellers || []).map(s => ({ value: String(s.id), label: s.name || s.id })),
      appointmentStartTimes: timeOptions,
      appointmentEndTimes: timeOptions,
      doctors: (doctors || [])
        .filter(d => d.status !== 'พักใช้งาน')
        .map(d => ({ value: String(d.id), label: d.name || d.id })),
      rooms: (rooms || [])
        .filter(r => r.status !== 'พักใช้งาน')
        .map(r => ({ value: String(r.id), label: r.name || r.roomName || r.id })),
      advisors: (staff || [])
        .filter(s => s.status !== 'พักใช้งาน')
        .map(s => ({ value: String(s.id), label: s.name || s.id })),
      sources: [...SOURCES],
    };
  }

  it('B3.1 — paymentMethods has Thai-canonical 5 entries', () => {
    const opts = buildOptions({ doctors: [], staff: [], rooms: [], sellers: [], timeSlots: TIME_SLOTS });
    expect(opts.paymentMethods).toHaveLength(5);
    expect(opts.paymentMethods.map(m => m.value)).toEqual(['cash', 'transfer', 'credit', 'debit', 'qr']);
  });

  it('B3.2 — sellers from listAllSellers shape', () => {
    const opts = buildOptions({
      doctors: [], staff: [], rooms: [],
      sellers: [{ id: '7', name: 'นพ. เอ' }, { id: '3', name: 'พิมพ์' }],
      timeSlots: TIME_SLOTS,
    });
    expect(opts.sellers).toEqual([
      { value: '7', label: 'นพ. เอ' },
      { value: '3', label: 'พิมพ์' },
    ]);
  });

  it('B3.3 — appointmentStartTimes + appointmentEndTimes use canonical 15-min slots', () => {
    const opts = buildOptions({ doctors: [], staff: [], rooms: [], sellers: [], timeSlots: TIME_SLOTS });
    expect(opts.appointmentStartTimes).toEqual([
      { value: '08:15', label: '08:15' },
      { value: '08:30', label: '08:30' },
      { value: '08:45', label: '08:45' },
    ]);
    expect(opts.appointmentEndTimes).toEqual(opts.appointmentStartTimes);
  });

  it('B3.4 — doctors filters out พักใช้งาน status', () => {
    const opts = buildOptions({
      doctors: [
        { id: '7', name: 'นพ. เอ', status: 'ใช้งาน' },
        { id: '8', name: 'นพ. บี', status: 'พักใช้งาน' },
      ],
      staff: [], rooms: [], sellers: [], timeSlots: TIME_SLOTS,
    });
    expect(opts.doctors).toHaveLength(1);
    expect(opts.doctors[0].label).toBe('นพ. เอ');
  });

  it('B3.5 — rooms uses name OR roomName OR id', () => {
    const opts = buildOptions({
      doctors: [], staff: [],
      rooms: [
        { id: '1', name: 'ห้อง 1' },
        { id: '2', roomName: 'ห้อง 2' },
        { id: '3' },
      ],
      sellers: [], timeSlots: TIME_SLOTS,
    });
    expect(opts.rooms).toEqual([
      { value: '1', label: 'ห้อง 1' },
      { value: '2', label: 'ห้อง 2' },
      { value: '3', label: '3' },
    ]);
  });

  it('B3.6 — advisors maps from listStaff', () => {
    const opts = buildOptions({
      doctors: [], staff: [{ id: '3', name: 'พิมพ์', status: 'ใช้งาน' }],
      rooms: [], sellers: [], timeSlots: TIME_SLOTS,
    });
    expect(opts.advisors).toEqual([{ value: '3', label: 'พิมพ์' }]);
  });

  it('B3.7 — empty inputs yield empty arrays not undefined', () => {
    const opts = buildOptions({ doctors: [], staff: [], rooms: [], sellers: [], timeSlots: [] });
    expect(opts.advisors).toEqual([]);
    expect(opts.doctors).toEqual([]);
    expect(opts.rooms).toEqual([]);
    expect(opts.sellers).toEqual([]);
    expect(opts.appointmentStartTimes).toEqual([]);
    expect(opts.paymentMethods).toHaveLength(5); // static still populated
    expect(opts.sources).toHaveLength(5);
  });
});

describe('Phase 20.0 Flow B — B4 graceful degradation on read failure', () => {
  it('B4.1 — listDoctors().catch(() => []) — single failure does not break entire build', () => {
    expect(STRIPPED).toMatch(/listDoctors\s*\(\s*\)\.catch\s*\(\s*\(\s*\)\s*=>\s*\[\s*\]/);
  });

  it('B4.2 — listStaff().catch fallback', () => {
    expect(STRIPPED).toMatch(/listStaff\s*\(\s*\)\.catch\s*\(\s*\(\s*\)\s*=>\s*\[\s*\]/);
  });

  it('B4.3 — listExamRooms().catch fallback', () => {
    expect(STRIPPED).toMatch(/listExamRooms\s*\(\s*\)\.catch\s*\(\s*\(\s*\)\s*=>\s*\[\s*\]/);
  });

  it('B4.4 — listAllSellers().catch fallback', () => {
    expect(STRIPPED).toMatch(/listAllSellers\s*\(\s*\)\.catch\s*\(\s*\(\s*\)\s*=>\s*\[\s*\]/);
  });
});

describe('Phase 20.0 Flow B — B5 deposit sync gating preserved (Phase 5 scope)', () => {
  // The deposit-sync workflow (broker.submitDeposit / updateDeposit /
  // cancelDeposit) keys off session.brokerProClinicId — that wiring stays
  // in Phase 4 because patient submit (which sets brokerProClinicId today)
  // is Phase 5 territory. After Phase 5, the gate flips to
  // session.beCustomerId and the broker.deposit* calls become be_*
  // createDeposit/updateDeposit/cancelDeposit.

  it('B5.1 — deposit-sync block still uses brokerProClinicId gate (Phase 5 will rewire)', () => {
    // Pre-Phase-5: this gate must still exist (sync only fires when
    // patient submit completed via broker.fillProClinic).
    expect(STRIPPED).toMatch(/brokerProClinicId/);
  });

  it('B5.2 — deposit ledger writes still go through broker (deferred to Phase 5)', () => {
    // Phase 4 deliberately scopes JUST the dropdown rewire. The deposit-sync
    // workflow + handleDepositCancel + handleSaveDepositData remain pre-Phase-5
    // until patient submit creates be_customers (then we can hand off to
    // be_deposits createDeposit). Lock this delineation so a future commit
    // can't accidentally orphan-drop the broker calls without their replacement
    // landing simultaneously.
    expect(STRIPPED).toMatch(/broker\.submitDeposit|broker\.updateDeposit|broker\.cancelDeposit/);
  });
});
