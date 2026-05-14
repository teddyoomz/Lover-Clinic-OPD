// Task 8 — webhook opt-out intent tests
// Verifies detectOptOutIntent pure helper that classifies incoming LINE text
// messages as opt-out / opt-in / no-match. Wired into handleMessage BEFORE
// existing intent dispatcher so it can short-circuit ProClinic-linking /
// courses / appointments / help flows.

import { describe, it, expect } from 'vitest';
import { detectOptOutIntent } from '../api/webhook/line.js';

describe('T8 detectOptOutIntent', () => {
  it('T8.1 หยุดแจ้งเตือน → optOut=true', () => {
    expect(detectOptOutIntent('หยุดแจ้งเตือน')).toEqual({ matched: true, optOut: true });
  });

  it('T8.2 stop → optOut=true (case-insensitive)', () => {
    expect(detectOptOutIntent('STOP')).toEqual({ matched: true, optOut: true });
    expect(detectOptOutIntent('stop')).toEqual({ matched: true, optOut: true });
    expect(detectOptOutIntent('Stop')).toEqual({ matched: true, optOut: true });
  });

  it('T8.3 เริ่มแจ้งเตือน → optOut=false', () => {
    expect(detectOptOutIntent('เริ่มแจ้งเตือน')).toEqual({ matched: true, optOut: false });
  });

  it('T8.4 start → optOut=false', () => {
    expect(detectOptOutIntent('start')).toEqual({ matched: true, optOut: false });
    expect(detectOptOutIntent('START')).toEqual({ matched: true, optOut: false });
  });

  it('T8.5 unrelated text → matched=false', () => {
    expect(detectOptOutIntent('hello')).toEqual({ matched: false });
    expect(detectOptOutIntent('คอร์ส')).toEqual({ matched: false });
    expect(detectOptOutIntent('ผูก 1234567890123')).toEqual({ matched: false });
    expect(detectOptOutIntent('นัด')).toEqual({ matched: false });
  });

  it('T8.6 trims whitespace', () => {
    expect(detectOptOutIntent('  หยุดแจ้งเตือน  ')).toEqual({ matched: true, optOut: true });
    expect(detectOptOutIntent('\tstop\n')).toEqual({ matched: true, optOut: true });
    expect(detectOptOutIntent(' เริ่มแจ้งเตือน ')).toEqual({ matched: true, optOut: false });
  });

  it('T8.7 defensive — non-string input → matched=false', () => {
    expect(detectOptOutIntent(null)).toEqual({ matched: false });
    expect(detectOptOutIntent(undefined)).toEqual({ matched: false });
    expect(detectOptOutIntent(123)).toEqual({ matched: false });
    expect(detectOptOutIntent('')).toEqual({ matched: false });
  });
});
