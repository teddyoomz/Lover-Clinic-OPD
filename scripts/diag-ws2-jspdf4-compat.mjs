// WS2 — jsPDF 4.x API-compat exercise. Calls EXACTLY the jsPDF APIs our 4
// PDF-generation sites use (documentPrintEngine + 3 reports) on the installed
// jspdf@4 and asserts each produces valid PDF bytes (no throw, %PDF magic).
// If this passes, the 3->4 major bump preserves our usage. Run: node scripts/diag-ws2-jspdf4-compat.mjs
import { jsPDF } from 'jspdf';
import zlib from 'node:zlib';

// Generate a GUARANTEED-valid 1x1 RGB PNG (correct IHDR/IDAT/IEND + CRC32) so
// we exercise jsPDF 4's strict PNG decoder honestly (the reports feed it real
// html2canvas PNGs — valid, correct CRC). No hand-typed/fake base64.
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; } return (~c) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; // 1x1, 8-bit, RGB
const idat = zlib.deflateSync(Buffer.from([0, 255, 255, 255])); // filter 0 + white pixel
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG = 'data:image/png;base64,' + Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]).toString('base64');
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABDz/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';

const isPdf = (ab) => { const b = new Uint8Array(ab); return b.length > 100 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; }; // %PDF
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('✓', n); } else { fail++; console.log('✗', n); } };

try {
  // SITE A — documentPrintEngine.js:741-749: new jsPDF({...}) + addImage JPEG FAST + output('blob')
  const a = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  a.addImage(JPEG, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  ok('A documentPrintEngine: new jsPDF + addImage(JPEG,FAST) + output(arraybuffer)', isPdf(a.output('arraybuffer')));
  const blob = a.output('blob');
  ok('A output("blob") returns a Blob', blob && typeof blob.size === 'number' && blob.size > 100);

  // SITE B — reports + AppointmentHubView: new jsPDF(landscape) + internal.pageSize.getWidth + addImage PNG + addPage + save
  const b = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const w = b.internal.pageSize.getWidth();
  ok('B internal.pageSize.getWidth() (landscape a4 ~297mm)', typeof w === 'number' && w > 290 && w < 300);
  b.addImage(PNG, 'PNG', 0, 0, 100, 100);
  b.addPage();
  b.addImage(PNG, 'PNG', 0, 30, 100, 100);
  ok('B addImage(PNG) x2 + addPage + output', isPdf(b.output('arraybuffer')));
  ok('B doc has 2 pages', b.getNumberOfPages() === 2);

  console.log(`\n[ws2-jspdf4] ${pass} pass / ${fail} fail · jsPDF v${a.version || '4.x'} API exercise`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ THREW on jsPDF v4:', e?.message || e);
  process.exit(2);
}
