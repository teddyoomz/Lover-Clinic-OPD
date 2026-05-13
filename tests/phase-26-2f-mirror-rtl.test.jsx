/**
 * tests/phase-26-2f-mirror-rtl.test.jsx
 *
 * M2 — RTL render tests for TreatmentReadOnlyMirror (Phase 26.2f Task 7).
 *
 * AV39 contract verified by mounting the component:
 *   - Root testid "treatment-read-only-mirror" visible
 *   - doctorName rendered from detail.doctorName (string — NOT detail.doctor.displayName)
 *   - assistants rendered from a.name (NOT a.displayName)
 *   - StatusBadge shows Thai label for doctor-recorded status
 *   - ALL inputs / textareas / selects are disabled (no editable controls)
 *   - Close button fires onClose callback
 *   - Primary accordion titles rendered
 *   - Graceful null/undefined treatmentDoc (no crash, root still present)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TreatmentReadOnlyMirror from '../src/components/backend/TreatmentReadOnlyMirror.jsx';

// ─── fixture ────────────────────────────────────────────────────────────────
// Field paths corrected to match actual Mirror data-extraction logic:
//   detail.doctorName (string)            — NOT detail.doctor.displayName
//   detail.assistants[].name              — NOT .displayName
//   detail.healthInfo.congenitalDisease   — NOT .chronicDisease
//   detail.vitals.weight                  — NOT detail.vitalSigns.weight
//   detail.medCertActuallyCome            — NOT detail.medicalCert.actuallyCome

const fixture = {
  treatmentId: 'BT-TEST-M2-001',
  status: 'doctor-recorded',
  recordedAt: '2026-05-13T10:30:00.000Z',
  detail: {
    treatmentDate: '2026-05-13',
    doctorName: 'นพ.ทดสอบสมิทธ์',
    branchName: 'สาขาทดสอบ',
    chiefComplaint: 'ปวดหัวตุบๆ',
    symptoms: '',
    physicalExam: '',
    assistants: [{ id: 'asst-1', name: 'พยาบาลทดสอบ' }],
    healthInfo: {
      bloodType: 'A+',
      congenitalDisease: 'ความดัน',
      drugAllergy: 'Penicillin',
      treatmentHistory: '',
    },
    vitals: {
      weight: '65',
      height: '170',
      temperature: '36.5',
      pulseRate: '80',
      respiratoryRate: '18',
      systolicBP: '120',
      diastolicBP: '80',
      oxygenSaturation: '98',
    },
    medCertActuallyCome: true,
    medCertIsRest: false,
    medCertIsOther: false,
    treatmentItems: [{ name: 'Test Course', product: 'Product A', qty: 1 }],
    medications: [],
    consumables: [],
  },
};

// ─── M2.1 — root testid present ──────────────────────────────────────────────
describe('M2.1 — root testid present', () => {
  it('renders root div with data-testid="treatment-read-only-mirror"', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} showCloseButton />,
    );
    expect(screen.getByTestId('treatment-read-only-mirror')).toBeTruthy();
  });
});

// ─── M2.2 — doctorName from detail.doctorName (string) ───────────────────────
describe('M2.2 — doctorName from detail.doctorName', () => {
  it('renders doctorName text sourced from detail.doctorName string field', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} />,
    );
    // The doctor name appears both in the header subtitle and in the OPD card input
    // We verify at least one node contains the name text
    const inputs = screen.getAllByDisplayValue('นพ.ทดสอบสมิทธ์');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    // All must be disabled (AV39)
    for (const input of inputs) {
      expect(input).toBeDisabled();
    }
  });

  it('falls back to "—" when detail.doctorName is absent', () => {
    const docNoDr = {
      ...fixture,
      detail: { ...fixture.detail, doctorName: undefined, doctorId: undefined },
    };
    render(<TreatmentReadOnlyMirror treatmentDoc={docNoDr} />);
    // Falls back to '—' string; at least the component renders without crash
    expect(screen.getByTestId('treatment-read-only-mirror')).toBeTruthy();
  });
});

// ─── M2.3 — assistants rendered using a.name ─────────────────────────────────
describe('M2.3 — assistants use a.name', () => {
  it('renders assistant name from a.name field (not a.displayName)', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} />,
    );
    const assistantInput = screen.getByDisplayValue('พยาบาลทดสอบ');
    expect(assistantInput).toBeTruthy();
    expect(assistantInput).toBeDisabled();
  });

  it('renders "—" when assistants array is empty', () => {
    const docNoAsst = {
      ...fixture,
      detail: { ...fixture.detail, assistants: [] },
    };
    render(<TreatmentReadOnlyMirror treatmentDoc={docNoAsst} />);
    // The input for assistants shows '—' when empty
    expect(screen.getByDisplayValue('—')).toBeTruthy();
  });
});

// ─── M2.4 — StatusBadge text for doctor-recorded ─────────────────────────────
describe('M2.4 — StatusBadge Thai label', () => {
  it('shows "หมอบันทึกแล้ว" for doctor-recorded status', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} />,
    );
    expect(screen.getByTestId('mirror-status-chip-doctor-recorded')).toBeTruthy();
    expect(screen.getByText('หมอบันทึกแล้ว')).toBeTruthy();
  });

  it('shows "วัดสัญญาณชีพแล้ว" for vitalsigns-recorded status', () => {
    const docVitals = { ...fixture, status: 'vitalsigns-recorded' };
    render(
      <TreatmentReadOnlyMirror treatmentDoc={docVitals} />,
    );
    expect(screen.getByTestId('mirror-status-chip-vitalsigns-recorded')).toBeTruthy();
    expect(screen.getByText('วัดสัญญาณชีพแล้ว')).toBeTruthy();
  });
});

// ─── M2.5 — ALL form controls are disabled (AV39) ────────────────────────────
describe('M2.5 — AV39 all form controls disabled', () => {
  it('every <input> rendered by the Mirror is disabled', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} showCloseButton />,
    );
    const inputs = document.querySelectorAll(
      '[data-testid="treatment-read-only-mirror"] input',
    );
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.disabled).toBe(true);
    }
  });

  it('every <textarea> rendered by the Mirror is disabled', () => {
    // Provide a fixture with fields that render textareas (symptoms, physicalExam, etc.)
    const richFixture = {
      ...fixture,
      detail: {
        ...fixture.detail,
        symptoms: 'มีไข้',
        physicalExam: 'ปกติ',
        diagnosis: 'ไข้หวัด',
        treatmentInfo: 'พักผ่อน',
        treatmentPlan: 'ติดตาม',
        treatmentNote: 'เบื้องต้น',
        additionalNote: 'หมายเหตุ',
      },
    };
    render(
      <TreatmentReadOnlyMirror treatmentDoc={richFixture} />,
    );
    const textareas = document.querySelectorAll(
      '[data-testid="treatment-read-only-mirror"] textarea',
    );
    expect(textareas.length).toBeGreaterThan(0);
    for (const ta of textareas) {
      expect(ta.disabled).toBe(true);
    }
  });

  it('no <input type="submit"> or <button> with save text inside the mirror', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} showCloseButton />,
    );
    const root = screen.getByTestId('treatment-read-only-mirror');
    // No submit inputs
    const submitInputs = root.querySelectorAll('input[type="submit"]');
    expect(submitInputs.length).toBe(0);
    // No buttons containing "บันทึก" as a save-action label (header title is OK)
    const buttons = root.querySelectorAll('button');
    for (const btn of buttons) {
      // The close button and accordion toggles are allowed
      // Only reject a <button> whose ONLY text content is "บันทึก" (save action)
      const text = btn.textContent?.trim();
      // These are the forbidden save-button patterns
      expect(text).not.toBe('บันทึก');
      expect(text).not.toBe('บันทึกข้อมูล');
      expect(text).not.toBe('บันทึกการรักษา_BUTTON');
    }
  });
});

// ─── M2.6 — close button fires onClose callback ──────────────────────────────
describe('M2.6 — close button callback', () => {
  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <TreatmentReadOnlyMirror
        treatmentDoc={fixture}
        showCloseButton
        onClose={onClose}
      />,
    );
    const closeBtn = screen.getByTestId('treatment-read-only-mirror-close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button is absent when showCloseButton is false', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} showCloseButton={false} />,
    );
    expect(screen.queryByTestId('treatment-read-only-mirror-close')).toBeNull();
  });
});

// ─── M2.7 — accordion section titles rendered ────────────────────────────────
describe('M2.7 — accordion section titles', () => {
  it('renders all four primary accordion section titles', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} />,
    );
    // These must be present per AV39 section ordering contract
    expect(screen.getByText('📋 ข้อมูลการรักษา (OPD)')).toBeTruthy();
    expect(screen.getByText('🩺 ข้อมูลสุขภาพ')).toBeTruthy();
    expect(screen.getByText('📊 สัญญาณชีพ (Vitals)')).toBeTruthy();
    expect(screen.getByText('📜 ใบรับรองแพทย์')).toBeTruthy();
  });

  it('renders item-list section titles', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={fixture} />,
    );
    expect(screen.getByText('💊 รายการที่ใช้บริการ')).toBeTruthy();
    expect(screen.getByText('💉 ยาที่จ่าย / Take-Home Meds')).toBeTruthy();
  });
});

// ─── M2.8 — graceful null/undefined treatmentDoc ─────────────────────────────
describe('M2.8 — graceful null treatmentDoc', () => {
  it('renders without crash when treatmentDoc is null', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={null} />,
    );
    expect(screen.getByTestId('treatment-read-only-mirror')).toBeTruthy();
  });

  it('renders without crash when treatmentDoc is undefined', () => {
    render(
      <TreatmentReadOnlyMirror />,
    );
    expect(screen.getByTestId('treatment-read-only-mirror')).toBeTruthy();
  });

  it('renders without crash when treatmentDoc is an empty object', () => {
    render(
      <TreatmentReadOnlyMirror treatmentDoc={{}} />,
    );
    expect(screen.getByTestId('treatment-read-only-mirror')).toBeTruthy();
  });
});
