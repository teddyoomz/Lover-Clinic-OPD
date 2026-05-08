// V64 — appointment hub PDF print template (Q5=C). Pure HTML/data builder.
// Render path: View component takes the HTML, paints it into a hidden DOM
// node, runs html2canvas + jsPDF.addImage directly (V32 lock — direct
// canvas+jsPDF render only; orchestrators like the deprecated wrapper are
// FORBIDDEN per V-log V32 series).

import { resolveAppointmentTypeLabel } from './appointmentTypes.js';

const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

const TAB_LABELS = {
  today: 'วันนี้',
  tomorrow: 'พรุ่งนี้',
  future: 'ล่วงหน้า 30 วัน',
  past: 'ย้อนหลัง 30 วัน',
};

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function thaiDateLabel(isoYMD) {
  if (typeof isoYMD !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoYMD)) return '';
  const [y, m, d] = isoYMD.split('-').map(Number);
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export function buildPrintRows({ appts = [], summaryMap = new Map() } = {}) {
  return appts.map(a => {
    const s = summaryMap.get(String(a.customerId)) || {};
    return {
      id: a.id,
      hn: s.hn || '',
      customerName: s.name || a.customerName || '',
      phone: s.phone || a.customerPhone || '',
      dateLabel: thaiDateLabel(a.date),
      timeLabel: `${a.startTime || '-'} - ${a.endTime || '-'}`,
      doctorName: a.doctorName || '-',
      assistantName: (a.assistantNames || []).join(', ') || a.assistantName || '-',
      roomName: a.roomName || '-',
      appointmentTo: a.appointmentTo || '-',
      typeLabel: resolveAppointmentTypeLabel(a.appointmentType) || '-',
      statusLabel: STATUS_LABELS[a.status] || a.status || '',
    };
  });
}

export function buildPrintHeader({ tab, branchName = '', from, to, now = new Date() } = {}) {
  const tabLabel = TAB_LABELS[tab] || tab;
  const dateRangeLabel = (from === to)
    ? thaiDateLabel(from)
    : `${thaiDateLabel(from)} - ${thaiDateLabel(to)}`;
  const printedAt = thaiDateLabel(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  return {
    title: 'ตารางนัดหมาย',
    subTitle: `สาขา: ${branchName || '-'}`,
    tabLabel,
    dateRangeLabel,
    printedAtLabel: `พิมพ์เมื่อ: ${printedAt}`,
  };
}

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPrintHTMLTemplate({ header, rows = [] } = {}) {
  const tableRows = rows.map(r => `
    <tr>
      <td>${escape(r.hn)}</td>
      <td>${escape(r.customerName)}</td>
      <td>${escape(r.phone)}</td>
      <td>${escape(r.dateLabel)}</td>
      <td>${escape(r.timeLabel)}</td>
      <td>${escape(r.doctorName)}</td>
      <td>${escape(r.assistantName)}</td>
      <td>${escape(r.roomName)}</td>
      <td>${escape(r.appointmentTo)}</td>
      <td>${escape(r.statusLabel)}</td>
    </tr>
  `).join('');
  return `
    <div style="font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; padding: 20px; color: #000; background: #fff;">
      <h2 style="margin: 0 0 4px 0;">${escape(header?.title || '')}</h2>
      <div style="font-size: 14px; margin-bottom: 2px;">${escape(header?.subTitle || '')}</div>
      <div style="font-size: 14px; margin-bottom: 2px;">ช่วง: ${escape(header?.tabLabel || '')} (${escape(header?.dateRangeLabel || '')})</div>
      <div style="font-size: 12px; margin-bottom: 16px; color: #666;">${escape(header?.printedAtLabel || '')}</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="border: 1px solid #ccc; padding: 6px;">HN</th>
            <th style="border: 1px solid #ccc; padding: 6px;">ลูกค้า</th>
            <th style="border: 1px solid #ccc; padding: 6px;">โทร</th>
            <th style="border: 1px solid #ccc; padding: 6px;">วันที่</th>
            <th style="border: 1px solid #ccc; padding: 6px;">เวลา</th>
            <th style="border: 1px solid #ccc; padding: 6px;">แพทย์</th>
            <th style="border: 1px solid #ccc; padding: 6px;">ผู้ช่วย</th>
            <th style="border: 1px solid #ccc; padding: 6px;">ห้อง</th>
            <th style="border: 1px solid #ccc; padding: 6px;">นัดมาเพื่อ</th>
            <th style="border: 1px solid #ccc; padding: 6px;">สถานะ</th>
          </tr>
        </thead>
        <tbody style="font-family: inherit;">
          ${tableRows || '<tr><td colspan="10" style="text-align:center; padding: 20px;">— ไม่มีรายการ —</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}
