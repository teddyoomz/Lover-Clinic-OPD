// V32-tris (2026-04-26) — BulkPrintModal smart staff-select picker (RTL)
//
// User: "ให้ Auto ดึง field แพทย์ และมีใบอนุญาต และฟอร์มอื่นๆถ้ามีพวก
//        พนักงานก็ให้ดึงมาเป็น dropdown ให้เลือกเลย ทำแบบฉลาดๆ smart อะ"
//
// Verifies the END-TO-END user flow:
//   1. Mount BulkPrintModal with chart template selected
//   2. doctor list loaded → staff-select renders as searchable dropdown
//      (NOT plain text input)
//   3. User types into search → list filters
//   4. User picks doctor → display name AND linked license / phone /
//      email / position / English name fields all auto-fill
//   5. Linked fields show populated values (not empty)
//
// This is the "full-flow simulate" required by Rule I — chains every UI
// step the user exercises, not just helper unit tests.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import BulkPrintModal from '../src/components/backend/BulkPrintModal.jsx';

// Mock backend client — listDocumentTemplates returns one chart template
// with staff-select + linked fields. listDoctors returns two doctors with
// rich field data so we can verify auto-fill.
vi.mock('../src/lib/backendClient.js', () => ({
  listDocumentTemplates: vi.fn().mockResolvedValue([
    {
      id: 'chart-tpl',
      docType: 'chart',
      name: 'เทมเพลต Chart (ประวัติการรักษา)',
      paperSize: 'A4',
      language: 'th',
      htmlTemplate: '<div>{{doctorName}} {{doctorLicenseNo}}</div>',
      fields: [
        { key: 'cc', label: 'CC', type: 'textarea' },
        { key: 'doctorName', label: 'แพทย์', type: 'staff-select', source: 'doctors', required: true },
        { key: 'doctorLicenseNo', label: 'เลขใบอนุญาต', type: 'text' },
        { key: 'doctorPhone', label: 'เบอร์โทร', type: 'text' },
        { key: 'doctorEmail', label: 'อีเมล', type: 'text' },
        { key: 'doctorPosition', label: 'ตำแหน่ง', type: 'text' },
        { key: 'doctorNameEn', label: 'ชื่อภาษาอังกฤษ', type: 'text' },
        { key: 'certNumber', label: 'เลขที่เอกสาร', type: 'text' },
      ],
    },
  ]),
  listDoctors: vi.fn().mockResolvedValue([
    {
      id: 'doc1',
      prefix: 'นพ.',
      firstname: 'สมชาย',
      lastname: 'ใจดี',
      firstnameEn: 'Somchai',
      lastnameEn: 'Jaidee',
      licenseNo: 'MD-12345',
      phone: '0812345678',
      email: 'somchai@clinic.com',
      position: 'แพทย์ผู้เชี่ยวชาญ',
    },
    {
      id: 'doc2',
      prefix: 'พญ.',
      firstname: 'แพรว',
      lastname: 'พิทักษ์',
      licenseNo: 'MD-67890',
      phone: '0998887777',
    },
  ]),
  listStaff: vi.fn().mockResolvedValue([]),
  recordDocumentPrint: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/lib/documentPrintEngine.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    exportDocumentToPdf: vi.fn().mockResolvedValue({ filename: 'x.pdf', blob: new Blob(['x']) }),
  };
});

describe('BulkPrintModal smart staff-select (V32-tris)', () => {
  const customer = {
    id: 'c1',
    customerName: 'Test Customer',
    proClinicHN: '000001',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('SP1.1 staff-select renders as smart dropdown (NOT plain text input)', async () => {
    render(<BulkPrintModal customers={[customer]} onClose={() => {}} />);
    // Wait for templates + doctor list to load
    await waitFor(() => expect(screen.getByTestId('bulk-print-template-chart-tpl')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bulk-print-template-chart-tpl'));
    // Now in FILL step — staff-select should render with our test-id
    await waitFor(() => expect(screen.getByTestId('staff-select-doctorName')).toBeInTheDocument());
  });

  test('SP1.2 typing into search filters the dropdown list', async () => {
    render(<BulkPrintModal customers={[customer]} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('bulk-print-template-chart-tpl')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bulk-print-template-chart-tpl'));
    await waitFor(() => expect(screen.getByTestId('staff-select-doctorName')).toBeInTheDocument());

    // Open the dropdown by focusing the input
    const input = screen.getByTestId('staff-select-doctorName').querySelector('input');
    fireEvent.focus(input);

    // List should show both doctors initially
    await waitFor(() => {
      expect(screen.getByText('นพ. สมชาย ใจดี')).toBeInTheDocument();
      expect(screen.getByText('พญ. แพรว พิทักษ์')).toBeInTheDocument();
    });

    // Type "สมชาย" — list should filter to one
    fireEvent.change(input, { target: { value: 'สมชาย' } });
    await waitFor(() => {
      expect(screen.getByText('นพ. สมชาย ใจดี')).toBeInTheDocument();
      expect(screen.queryByText('พญ. แพรว พิทักษ์')).not.toBeInTheDocument();
    });
  });

  test('SP1.3 picking a doctor auto-fills license + phone + email + position + English name (V32-tris smart auto-fill)', async () => {
    render(<BulkPrintModal customers={[customer]} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('bulk-print-template-chart-tpl')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bulk-print-template-chart-tpl'));
    await waitFor(() => expect(screen.getByTestId('staff-select-doctorName')).toBeInTheDocument());

    // Open dropdown + pick doctor 1
    const input = screen.getByTestId('staff-select-doctorName').querySelector('input');
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByText('นพ. สมชาย ใจดี')).toBeInTheDocument());
    fireEvent.click(screen.getByText('นพ. สมชาย ใจดี'));

    // After pick — verify ALL linked fields auto-filled
    await waitFor(() => {
      expect(input).toHaveValue('นพ. สมชาย ใจดี');
    });
    // Linked fields are <input data-field="..."> — match by data-field
    const licenseInput = document.querySelector('[data-field="doctorLicenseNo"]');
    const phoneInput = document.querySelector('[data-field="doctorPhone"]');
    const emailInput = document.querySelector('[data-field="doctorEmail"]');
    const posInput = document.querySelector('[data-field="doctorPosition"]');
    const enInput = document.querySelector('[data-field="doctorNameEn"]');
    expect(licenseInput).toHaveValue('MD-12345');
    expect(phoneInput).toHaveValue('0812345678');
    expect(emailInput).toHaveValue('somchai@clinic.com');
    expect(posInput).toHaveValue('แพทย์ผู้เชี่ยวชาญ');
    expect(enInput).toHaveValue('Somchai Jaidee');
  });

  test('SP1.4 picking doctor 2 (only license + phone in record) only fills those linked fields', async () => {
    render(<BulkPrintModal customers={[customer]} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('bulk-print-template-chart-tpl')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bulk-print-template-chart-tpl'));
    await waitFor(() => expect(screen.getByTestId('staff-select-doctorName')).toBeInTheDocument());

    const input = screen.getByTestId('staff-select-doctorName').querySelector('input');
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByText('พญ. แพรว พิทักษ์')).toBeInTheDocument());
    fireEvent.click(screen.getByText('พญ. แพรว พิทักษ์'));

    await waitFor(() => expect(input).toHaveValue('พญ. แพรว พิทักษ์'));
    expect(document.querySelector('[data-field="doctorLicenseNo"]')).toHaveValue('MD-67890');
    expect(document.querySelector('[data-field="doctorPhone"]')).toHaveValue('0998887777');
    // No email / position / English name on doc2 — fields stay empty
    expect(document.querySelector('[data-field="doctorEmail"]')).toHaveValue('');
    expect(document.querySelector('[data-field="doctorPosition"]')).toHaveValue('');
    expect(document.querySelector('[data-field="doctorNameEn"]')).toHaveValue('');
  });

  test('SP1.5 search by license number works (T3.4 invariant in real UI)', async () => {
    render(<BulkPrintModal customers={[customer]} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('bulk-print-template-chart-tpl')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bulk-print-template-chart-tpl'));
    await waitFor(() => expect(screen.getByTestId('staff-select-doctorName')).toBeInTheDocument());

    const input = screen.getByTestId('staff-select-doctorName').querySelector('input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'MD-67890' } });
    await waitFor(() => {
      expect(screen.getByText('พญ. แพรว พิทักษ์')).toBeInTheDocument();
      expect(screen.queryByText('นพ. สมชาย ใจดี')).not.toBeInTheDocument();
    });
  });

  test('SP1.6 dropdown count badge reflects loaded list size (UI nicety)', async () => {
    render(<BulkPrintModal customers={[customer]} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('bulk-print-template-chart-tpl')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bulk-print-template-chart-tpl'));
    await waitFor(() => expect(screen.getByTestId('staff-select-doctorName')).toBeInTheDocument());
    // Count "(2 รายการ)" appears next to label
    expect(screen.getByText(/\(2 รายการ\)/)).toBeInTheDocument();
  });
});
