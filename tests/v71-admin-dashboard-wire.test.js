// V71 — source-grep regression: AdminDashboard wires onMarkServiceComplete to
// AppointmentHubView using auth.currentUser.uid + the canonical writer.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');

describe('V71 AdminDashboard handler wiring', () => {
  const src = read('src/pages/AdminDashboard.jsx');

  it('AD1.1 AppointmentHubView receives onMarkServiceComplete prop', () => {
    // Must contain `onMarkServiceComplete={` in the AppointmentHubView render
    expect(src).toMatch(/<AppointmentHubView[\s\S]*?onMarkServiceComplete\s*=/);
  });

  it('AD1.2 handler calls markAppointmentServiceCompleted with auth uid', () => {
    expect(src).toMatch(/markAppointmentServiceCompleted/);
    // uid sourced from auth.currentUser
    expect(src).toMatch(/auth\?\.currentUser\?\.uid|auth\.currentUser\?\.uid|auth\.currentUser\.uid/);
  });

  it('AD1.3 V71 marker comment present near the handler', () => {
    expect(src).toMatch(/V71[^\n]*(?:service[ -]?complete|mark[ -]?complete)/i);
  });
});
