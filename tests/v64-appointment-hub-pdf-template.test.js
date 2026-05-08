import { describe, it, expect } from 'vitest';
import {
  buildPrintRows,
  buildPrintHeader,
  buildPrintHTMLTemplate,
} from '../src/lib/appointmentHubPrintTemplate.js';

const FIXED_NOW = new Date('2026-05-08T07:00:00+07:00');

describe('V64.P appointmentHubPrintTemplate — pure layout', () => {
  it('P1.1 buildPrintRows returns one row per appt with denormalized customer + appt fields', () => {
    const rows = buildPrintRows({
      appts: [
        { id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '09:00', endTime: '09:30', doctorName: 'หมอ น้ำตาล', roomName: 'ห้อง 3', status: 'pending', appointmentTo: 'หัตถการ' },
      ],
      summaryMap: new Map([['C1', { hn: 'HN001', name: 'Alice', phone: '0811111111' }]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      hn: 'HN001', customerName: 'Alice', dateLabel: expect.any(String), timeLabel: '09:00 - 09:30',
      doctorName: 'หมอ น้ำตาล', roomName: 'ห้อง 3', appointmentTo: 'หัตถการ', statusLabel: 'รอยืนยัน',
    });
  });

  it('P1.2 buildPrintHeader includes branch name + tab label + thai-formatted date range', () => {
    const h = buildPrintHeader({ tab: 'today', branchName: 'พระราม 9', from: '2026-05-08', to: '2026-05-08', now: FIXED_NOW });
    expect(h.title).toMatch(/นัดหมาย/);
    expect(h.subTitle).toMatch(/พระราม 9/);
    expect(h.tabLabel).toMatch(/วันนี้/);
    expect(h.dateRangeLabel).toMatch(/8.*พฤษภาคม.*2569/);
  });

  it('P1.3 buildPrintHTMLTemplate returns a string with embedded thai font + tabular structure', () => {
    const html = buildPrintHTMLTemplate({
      header: buildPrintHeader({ tab: 'today', branchName: 'TestBranch', from: '2026-05-08', to: '2026-05-08', now: FIXED_NOW }),
      rows: [],
    });
    expect(typeof html).toBe('string');
    expect(html).toMatch(/<table/);
    expect(html).toMatch(/Sarabun|Noto Sans Thai|font-family/i);
  });

  it('P1.4 V32 lock — no html2pdf reference; uses html2canvas + jsPDF directly', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/appointmentHubPrintTemplate.js', 'utf8');
    expect(src).not.toMatch(/html2pdf/i);
  });
});
