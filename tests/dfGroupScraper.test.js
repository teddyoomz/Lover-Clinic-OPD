// ─── Phase 14.x · DF group scraper adversarial tests ─────────────────────
// Guards the two scraper helpers that back the MasterDataTab "DF groups"
// sync button: extractDfGroupList (tab strip on /admin/df/df-group) +
// extractDfGroupRates (per-group form_1 field matrix).

import { describe, it, expect } from 'vitest';
import { extractDfGroupList, extractDfGroupRates } from '../api/proclinic/_lib/scraper.js';

const tabsHtml = `
<html><body>
<div class="tabs">
  <a href="/admin/df/df-group">ค่ามือกลุ่ม</a>
  <a href="/admin/df/df-group?df_group_id=28">ตัดไหม</a>
  <a href="/admin/df/df-group?df_group_id=26">ตอกเส้น\n\t\t\tคัดลอกค่ามือ</a>
  <a href="/admin/df/df-group?df_group_id=25">นวด\n\t\t\tคัดลอกค่ามือ</a>
  <a href="/admin/df/df-group?df_group_id=16">กลุ่มหมอประจำ</a>
  <a href="/admin/df/df-group?df_group_id=28">ตัดไหม (dup link)</a>
</div>
</body></html>
`;

const ratesHtml = (gId) => `
<html><body>
<form id="form_1" method="POST" action="/admin/df/df-group">
  <input type="hidden" name="_token" value="abc">
  <!-- Group ${gId} course 1001 — 400 baht -->
  <input type="number" name="df_group_${gId}_df_course_1001" value="400">
  <input type="radio" name="df_group_${gId}_df_course_1001_type" value="%" aria-label="%">
  <input type="radio" name="df_group_${gId}_df_course_1001_type" value="บาท" aria-label="บาท" checked="checked">
  <!-- Group ${gId} course 1002 — 10 percent -->
  <input type="number" name="df_group_${gId}_df_course_1002" value="10">
  <input type="radio" name="df_group_${gId}_df_course_1002_type" value="%" aria-label="%" checked="checked">
  <input type="radio" name="df_group_${gId}_df_course_1002_type" value="บาท" aria-label="บาท">
  <!-- Group ${gId} course 1003 — 0 (type unchecked, defaults to baht) -->
  <input type="number" name="df_group_${gId}_df_course_1003" value="0">
  <input type="radio" name="df_group_${gId}_df_course_1003_type" value="%" aria-label="%">
  <input type="radio" name="df_group_${gId}_df_course_1003_type" value="บาท" aria-label="บาท">
</form>
</body></html>
`;

describe('extractDfGroupList', () => {
  it('DFL1: extracts distinct group ids from tab links', () => {
    const list = extractDfGroupList(tabsHtml);
    const ids = list.map((g) => g.id).sort();
    expect(ids).toEqual(['16', '25', '26', '28']);
  });
  it('DFL2: strips trailing "คัดลอกค่ามือ" newline-junk from name', () => {
    const list = extractDfGroupList(tabsHtml);
    const byId = Object.fromEntries(list.map((g) => [g.id, g.name]));
    expect(byId['26']).toBe('ตอกเส้น');
    expect(byId['25']).toBe('นวด');
    expect(byId['28']).toBe('ตัดไหม'); // first match wins even though dup link appears
  });
  it('DFL3: HTML with no matching links returns empty array', () => {
    expect(extractDfGroupList('<html><body>empty</body></html>')).toEqual([]);
  });
  it('DFL4: first name wins on dup links (stable ordering)', () => {
    const html = `
      <a href="?df_group_id=5">First</a>
      <a href="?df_group_id=5">Second</a>
    `;
    const list = extractDfGroupList(html);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('First');
  });
  it('DFL5: empty anchor text falls back to id', () => {
    const list = extractDfGroupList('<a href="?df_group_id=99"></a>');
    expect(list).toEqual([{ id: '99', name: '99' }]);
  });
});

describe('extractDfGroupRates', () => {
  it('DFR1: parses checked "บาท" radio → type=baht with value', () => {
    const rates = extractDfGroupRates(ratesHtml('28'), '28');
    const r1001 = rates.find((r) => r.courseId === '1001');
    expect(r1001).toBeTruthy();
    expect(r1001.value).toBe(400);
    expect(r1001.type).toBe('baht');
  });
  it('DFR2: parses checked "%" radio → type=percent', () => {
    const rates = extractDfGroupRates(ratesHtml('28'), '28');
    const r1002 = rates.find((r) => r.courseId === '1002');
    expect(r1002.value).toBe(10);
    expect(r1002.type).toBe('percent');
  });
  it('DFR3: no checked radio → defaults to baht (UI convention)', () => {
    const rates = extractDfGroupRates(ratesHtml('28'), '28');
    const r1003 = rates.find((r) => r.courseId === '1003');
    expect(r1003.value).toBe(0);
    expect(r1003.type).toBe('baht');
  });
  it('DFR4: expectedGroupId filters out stray foreign-group fields', () => {
    // HTML contains group 28 + stray 99 — only 28 should be extracted.
    const mixed = `
      <input type="number" name="df_group_28_df_course_1001" value="100">
      <input type="radio" name="df_group_28_df_course_1001_type" value="บาท" checked="checked">
      <input type="number" name="df_group_99_df_course_2222" value="555">
      <input type="radio" name="df_group_99_df_course_2222_type" value="บาท" checked="checked">
    `;
    const rates = extractDfGroupRates(mixed, '28');
    expect(rates).toHaveLength(1);
    expect(rates[0].courseId).toBe('1001');
    expect(rates[0].value).toBe(100);
  });
  it('DFR5: no expectedGroupId → extracts every group (both 28 + 99)', () => {
    const mixed = `
      <input type="number" name="df_group_28_df_course_1001" value="100">
      <input type="radio" name="df_group_28_df_course_1001_type" value="บาท" checked="checked">
      <input type="number" name="df_group_99_df_course_2222" value="555">
      <input type="radio" name="df_group_99_df_course_2222_type" value="%" checked="checked">
    `;
    const rates = extractDfGroupRates(mixed);
    expect(rates).toHaveLength(2);
    // Order not guaranteed; check by courseId
    const byCourse = Object.fromEntries(rates.map((r) => [r.courseId, r]));
    expect(byCourse['1001'].type).toBe('baht');
    expect(byCourse['2222'].value).toBe(555);
    expect(byCourse['2222'].type).toBe('percent');
  });
  it('DFR6: non-numeric value → clamped to 0', () => {
    const broken = `
      <input type="number" name="df_group_5_df_course_1" value="abc">
      <input type="radio" name="df_group_5_df_course_1_type" value="บาท" checked="checked">
    `;
    const rates = extractDfGroupRates(broken, '5');
    expect(rates[0].value).toBe(0);
  });
  it('DFR7: HTML with no DF fields returns empty rates', () => {
    expect(extractDfGroupRates('<html><body>blank</body></html>')).toEqual([]);
  });
  it('DFR8: input without paired type radio → defaults to baht', () => {
    const lonely = `
      <input type="number" name="df_group_7_df_course_42" value="250">
    `;
    const rates = extractDfGroupRates(lonely, '7');
    expect(rates).toHaveLength(1);
    expect(rates[0].value).toBe(250);
    expect(rates[0].type).toBe('baht');
  });
});
