// V128 (2026-05-28) — two fixes shipped together:
//  (A-E) appointment phone: linked appts never denormalized customerPhone →
//        hover card showed phone "sometimes". Write-chokepoint denorm +
//        render live-resolve (apptPhoneValue || resolvedPhone). AV145.
//  (F-G) calendar grid: fixed SLOT_H=22 → dynamic slotH fills viewport height
//        on tall (2K+) desktop screens. computeApptSlotHeight. V128.cal.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolveCustomerPhone } from '../src/lib/customerDisplayName.js';
import { apptPhoneValue } from '../src/lib/appointmentDisplay.js';
import { computeApptSlotHeight } from '../src/components/backend/AppointmentCalendarView.jsx';

// ─── A. resolveCustomerPhone — shape walk ───────────────────────────────────
describe('V128.A resolveCustomerPhone', () => {
  it('A1: patientData.phone is the canonical first choice', () => {
    expect(resolveCustomerPhone({ patientData: { phone: '0812345678' } })).toBe('0812345678');
  });
  it('A2: falls back patientData.tel → mobile → phoneNumber → top-level', () => {
    expect(resolveCustomerPhone({ patientData: { tel: '021112222' } })).toBe('021112222');
    expect(resolveCustomerPhone({ patientData: { mobile: '0890001111' } })).toBe('0890001111');
    expect(resolveCustomerPhone({ patientData: { phoneNumber: '0890002222' } })).toBe('0890002222');
    expect(resolveCustomerPhone({ phone: '0890003333' })).toBe('0890003333');
    expect(resolveCustomerPhone({ tel: '0890004444' })).toBe('0890004444');
  });
  it('A3: patientData.phone wins over top-level phone', () => {
    expect(resolveCustomerPhone({ patientData: { phone: 'A' }, phone: 'B' })).toBe('A');
  });
  it('A4: empty / null / non-object / whitespace → ""', () => {
    expect(resolveCustomerPhone(null)).toBe('');
    expect(resolveCustomerPhone(undefined)).toBe('');
    expect(resolveCustomerPhone('x')).toBe('');
    expect(resolveCustomerPhone({})).toBe('');
    expect(resolveCustomerPhone({ patientData: { phone: '   ' } })).toBe('');
  });
});

// ─── B. apptPhoneValue UNCHANGED (case 2 preserved) ─────────────────────────
describe('V128.B apptPhoneValue — customerPhone || customerPhoneTemp (pick-later kept)', () => {
  it('B1: denormalized customerPhone wins', () => {
    expect(apptPhoneValue({ customerPhone: '0811', customerPhoneTemp: '0822' })).toBe('0811');
  });
  it('B2: pick-later customerPhoneTemp shows when no customerPhone', () => {
    expect(apptPhoneValue({ customerPhone: '', customerPhoneTemp: '0899999999' })).toBe('0899999999');
  });
  it('B3: neither → ""', () => {
    expect(apptPhoneValue({ customerId: 'LC-1' })).toBe('');
    expect(apptPhoneValue(null)).toBe('');
  });
});

// ─── C. AppointmentDetailBody — phone = apptPhoneValue || resolvedPhone ──────
const baseAppt = {
  appointmentId: 'A1', customerName: 'นาย ก ข', startTime: '16:00', endTime: '16:30',
  doctorName: 'นพ.สมชาย', status: 'confirmed',
};
async function bodyOf(appt, props = {}) {
  const { default: AppointmentDetailBody } = await import('../src/components/backend/AppointmentDetailBody.jsx');
  render(<AppointmentDetailBody appt={appt} roomName="" doctorMap={{}} variant="peek" {...props} />);
}
describe('V128.C AppointmentDetailBody phone fallback', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('C1 (case 1): LINKED appt with NO phone fields + resolvedPhone → shows resolved', async () => {
    await bodyOf({ ...baseAppt, customerId: 'LC-26000052' }, { resolvedPhone: '0871457192' });
    expect(screen.getByTestId('appt-detail-phone')).toHaveTextContent('0871457192');
  });
  it('C2 (case 2 — user requirement): pick-later customerPhoneTemp shows even with NO resolvedPhone', async () => {
    await bodyOf({ ...baseAppt, customerId: '', customerPhoneTemp: '0899999999' }, { resolvedPhone: '' });
    expect(screen.getByTestId('appt-detail-phone')).toHaveTextContent('0899999999');
  });
  it('C3: denormalized customerPhone shows without needing resolvedPhone', async () => {
    await bodyOf({ ...baseAppt, customerPhone: '0812223333' });
    expect(screen.getByTestId('appt-detail-phone')).toHaveTextContent('0812223333');
  });
  it('C4: no phone anywhere → no phone line', async () => {
    await bodyOf({ ...baseAppt, customerId: 'LC-1' }, { resolvedPhone: '' });
    expect(screen.queryByTestId('appt-detail-phone')).toBeNull();
  });
  it('C5: apptPhoneValue WINS over resolvedPhone (temp beats stale resolve)', async () => {
    await bodyOf({ ...baseAppt, customerPhoneTemp: '0811111111' }, { resolvedPhone: '0822222222' });
    expect(screen.getByTestId('appt-detail-phone')).toHaveTextContent('0811111111');
  });
});

// ─── D. useResolvedApptPhone hook (mock getCustomer) ────────────────────────
vi.mock('../src/lib/scopedDataLayer.js', () => ({ getCustomer: vi.fn() }));
import { getCustomer } from '../src/lib/scopedDataLayer.js';
import useResolvedApptPhone, { __resetApptPhoneCache } from '../src/hooks/useResolvedApptPhone.js';

describe('V128.D useResolvedApptPhone', () => {
  beforeEach(() => { __resetApptPhoneCache(); getCustomer.mockReset(); });

  it('D1: direct phone present → returns it, NEVER fetches', async () => {
    const { result } = renderHook(() => useResolvedApptPhone({ customerId: 'LC-1', customerPhoneTemp: '0899' }));
    expect(result.current).toBe('0899');
    expect(getCustomer).not.toHaveBeenCalled();
  });
  it('D2: linked + no direct phone → fetches + resolves patientData.phone', async () => {
    getCustomer.mockResolvedValue({ patientData: { phone: '0871457192' } });
    const { result } = renderHook(() => useResolvedApptPhone({ customerId: 'LC-26000052' }));
    await waitFor(() => expect(result.current).toBe('0871457192'));
    expect(getCustomer).toHaveBeenCalledWith('LC-26000052');
  });
  it('D3: null appt → "" + no fetch', async () => {
    const { result } = renderHook(() => useResolvedApptPhone(null));
    expect(result.current).toBe('');
    expect(getCustomer).not.toHaveBeenCalled();
  });
  it('D4: fetch failure is non-fatal → ""', async () => {
    getCustomer.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() => useResolvedApptPhone({ customerId: 'LC-9' }));
    await waitFor(() => expect(getCustomer).toHaveBeenCalled());
    expect(result.current).toBe('');
  });
});

// ─── E. source-grep — write-chokepoint + render wiring + AV145 ──────────────
describe('V128.E source-grep (AV145)', () => {
  const bc = readFileSync('src/lib/backendClient.js', 'utf8');
  const body = readFileSync('src/components/backend/AppointmentDetailBody.jsx', 'utf8');
  const hook = readFileSync('src/hooks/useResolvedApptPhone.js', 'utf8');
  const peek = readFileSync('src/components/backend/AppointmentHoverPeek.jsx', 'utf8');
  const modal = readFileSync('src/components/backend/AppointmentDetailPopover.jsx', 'utf8');
  const cal = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
  const cdn = readFileSync('src/lib/customerDisplayName.js', 'utf8');
  const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

  it('E1: write-chokepoint resolver defined + called in create AND update', () => {
    expect(bc).toMatch(/async function _resolveAppointmentCustomerPhone/);
    // create path stamps customerPhone via the resolver
    expect(bc).toMatch(/_v128CustomerPhone = await _resolveAppointmentCustomerPhone\(persistData\)/);
    expect(bc).toMatch(/customerPhone: _v128CustomerPhone/);
    // update path resolves when caller + existing both empty
    expect(bc).toMatch(/_v128UpdPhone = await _resolveAppointmentCustomerPhone/);
    expect(bc).toMatch(/resolveCustomerPhone/); // imported + used
  });
  it('E2: resolveCustomerPhone centralized in customerDisplayName.js (Rule of 3)', () => {
    expect(cdn).toMatch(/export function resolveCustomerPhone/);
  });
  it('E3: body phone = apptPhoneValue(appt) || resolvedPhone', () => {
    expect(body).toMatch(/apptPhoneValue\(appt\)\s*\|\|\s*resolvedPhone/);
  });
  it('E4: hook lazy-resolves via getCustomer + resolveCustomerPhone, apptPhoneValue first', () => {
    expect(hook).toMatch(/apptPhoneValue\(appt\)/);
    expect(hook).toMatch(/getCustomer\(cid\)/);
    expect(hook).toMatch(/resolveCustomerPhone/);
  });
  it('E5: peek + popover forward resolvedPhone; calendar supplies peekPhone/detailPhone', () => {
    expect(peek).toMatch(/resolvedPhone/);
    expect(modal).toMatch(/resolvedPhone/);
    expect(cal).toMatch(/useResolvedApptPhone\(peek\?\.appt\)/);
    expect(cal).toMatch(/useResolvedApptPhone\(detailAppt\)/);
    expect(cal).toMatch(/resolvedPhone=\{peekPhone\}/);
    expect(cal).toMatch(/resolvedPhone=\{detailPhone\}/);
  });
  it('E6: AV145 invariant present', () => {
    expect(av).toMatch(/### AV145 —/);
    expect(av).toMatch(/_resolveAppointmentCustomerPhone/);
  });
});

// ─── F. computeApptSlotHeight — dynamic grid row height ─────────────────────
describe('V128.cal.F computeApptSlotHeight', () => {
  it('F1: fills available px ÷ rows when within clamp', () => {
    expect(computeApptSlotHeight(1200, 37)).toBe(32); // floor(1200/37)=32, in [22,46]
  });
  it('F2: clamps UP to MIN (22) on a short viewport', () => {
    expect(computeApptSlotHeight(500, 37)).toBe(22);  // floor(500/37)=13 → 22
  });
  it('F3: clamps DOWN to MAX (46) on a huge viewport', () => {
    expect(computeApptSlotHeight(4000, 37)).toBe(46); // floor(4000/37)=108 → 46
  });
  it('F4: adversarial — 0/neg/NaN rows or avail never crash; return ≥ MIN', () => {
    expect(computeApptSlotHeight(1000, 0)).toBe(46);   // 0 rows → treat as 1 → clamp MAX
    expect(computeApptSlotHeight(-100, 37)).toBe(22);  // negative avail → MIN
    expect(computeApptSlotHeight(NaN, 37)).toBe(22);
    expect(computeApptSlotHeight(1000, NaN)).toBe(46); // NaN rows → 1
    expect(computeApptSlotHeight('x', 'y')).toBe(22);
  });
});

// ─── G. source-grep — dynamic grid height wiring ────────────────────────────
describe('V128.cal.G source-grep', () => {
  const cal = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
  it('G1: MIN/MAX consts + exported pure helper; NO fixed const SLOT_H', () => {
    expect(cal).toMatch(/const MIN_SLOT_H = 22;/);
    expect(cal).toMatch(/const MAX_SLOT_H = 46;/);
    expect(cal).toMatch(/export function computeApptSlotHeight/);
    expect(cal).not.toMatch(/^const SLOT_H\s*=/m);
  });
  it('G2: slotH state + useLayoutEffect measure + gridRowsRef + window resize', () => {
    expect(cal).toMatch(/const \[slotH, setSlotH\] = useState\(MIN_SLOT_H\)/);
    expect(cal).toMatch(/useLayoutEffect\(/);
    expect(cal).toMatch(/gridRowsRef/);
    expect(cal).toMatch(/window\.innerHeight - top/);
    expect(cal).toMatch(/addEventListener\('resize'/);
  });
  it('G3: slotH used for row height AND absolute block math', () => {
    expect(cal).toMatch(/height: slotH \}\}/);          // rows / cells
    expect(cal).toMatch(/span \* slotH - 4/);            // block height
    expect(cal).toMatch(/top: span \* slotH \+ 1/);      // dup indicator
  });
});
