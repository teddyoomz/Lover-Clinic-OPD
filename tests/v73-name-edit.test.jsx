// tests/v73-name-edit.test.jsx
// V73 name-edit feature (2026-05-18) — regression bank.
//
// User request: "เพิ่มระบบแก้ชื่อในแชทด้วย ตอนนี้มันถามชื่อแค่ครั้งเดียวตอนเข้าครั้งแรก
// แต่ต่อไปเปิดให้แต่ละเครื่องแก้ชื่อตัวเองเมื่อไหร่ก็ได้"
//
// Design:
//   - StaffChatNamePicker accepts `initialValue` + auto-detects edit mode
//     (title/description/save-button text change)
//   - StaffChatHeader shows clickable "👤 <name> ✏️" chip when displayName set;
//     hidden when no name (first-send flow handles that)
//   - useStaffChat exposes `displayName`, `nameEditMode`, `openNameEdit`,
//     `closeNameEdit` for the widget to thread
//   - Past messages keep their stored displayName (Firestore immutable); only
//     future messages use the new name

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const picker = SRC('src/components/staffchat/StaffChatNamePicker.jsx');
const header = SRC('src/components/staffchat/StaffChatHeader.jsx');
const panel = SRC('src/components/staffchat/StaffChatPanel.jsx');
const widget = SRC('src/components/staffchat/StaffChatWidget.jsx');
const hook = SRC('src/hooks/useStaffChat.js');

describe('V73.NE1 — NamePicker accepts initialValue + edit-mode UX', () => {
  it('NE1.1 picker accepts initialValue prop', () => {
    expect(picker).toMatch(/function StaffChatNamePicker\(\{[^}]*initialValue/);
  });

  it('NE1.2 picker auto-detects edit mode via isEdit', () => {
    expect(picker).toMatch(/const isEdit\s*=\s*!!\(initialValue/);
  });

  it('NE1.3 picker data-mode attribute reflects edit-vs-first-send', () => {
    expect(picker).toMatch(/data-mode=\{isEdit\s*\?\s*'edit'\s*:\s*'first-send'\}/);
  });

  it('NE1.4 picker title flips for edit mode (แก้ชื่อ vs ตั้งชื่อ)', () => {
    expect(picker).toMatch(/'แก้ชื่อในแชท'[\s\S]*'ตั้งชื่อในแชท'/);
  });

  it('NE1.5 picker save button label is "บันทึก" (V73 color-picker 2026-05-18 unified both modes)', () => {
    // Pre-color-picker: edit-mode button said "เปลี่ยนชื่อ", first-send said "บันทึก".
    // Post-color-picker: both modes save name + color (canSave checks either changed).
    // Unified to "บันทึก" since user might be saving only color change in edit mode.
    expect(picker).toMatch(/>\s*\{isEdit\s*\?\s*'บันทึก'\s*:\s*'บันทึก'\}\s*</);
  });

  it('NE1.6 picker save disabled gate uses canSave (combines name + color change checks)', () => {
    // Pre-color-picker: disabled when edit + name unchanged.
    // Post-color-picker: canSave = valid && (nameChanged || colorChanged).
    expect(picker).toMatch(/disabled=\{!canSave\}/);
    expect(picker).toMatch(/const\s+canSave\s*=\s*valid\s*&&\s*\(nameChanged\s*\|\|\s*colorChanged\)/);
  });

  it('NE1.7 picker useState init handles missing initialValue gracefully', () => {
    expect(picker).toMatch(/typeof initialValue === 'string' \? initialValue : ''/);
  });
});

describe('V73.NE2 — Header renders edit-name chip when displayName set', () => {
  it('NE2.1 header imports Pencil icon', () => {
    expect(header).toMatch(/import\s*\{[^}]*Pencil/);
  });

  it('NE2.2 header accepts onEditName + displayName props', () => {
    expect(header).toMatch(/function StaffChatHeader\(\{[^}]*onEditName[^}]*displayName/);
  });

  it('NE2.3 header reads displayName via prop OR localStorage fallback', () => {
    expect(header).toMatch(/displayName[\s\S]*\.trim\(\)\)\s*\|\|\s*getDisplayName\(\)/);
  });

  it('NE2.4 chip rendered only when currentName + onEditName both truthy', () => {
    expect(header).toMatch(/\{currentName\s*&&\s*onEditName\s*&&/);
  });

  it('NE2.5 chip has data-testid for L1 verification', () => {
    expect(header).toMatch(/data-testid="staff-chat-header-edit-name"/);
  });

  it('NE2.6 chip renders "👤 <name>" + Pencil icon', () => {
    expect(header).toMatch(/👤 \{currentName\}/);
    expect(header).toMatch(/<Pencil/);
  });

  it('NE2.7 chip click invokes onEditName', () => {
    expect(header).toMatch(/onClick=\{onEditName\}/);
  });
});

describe('V73.NE3 — Panel threads onEditName + displayName through to Header', () => {
  it('NE3.1 Panel destructures onEditName + displayName props', () => {
    expect(panel).toMatch(/onEditName/);
    expect(panel).toMatch(/displayName/);
  });

  it('NE3.2 Panel passes onEditName + displayName to Header', () => {
    expect(panel).toMatch(/onEditName=\{onEditName\}/);
    expect(panel).toMatch(/displayName=\{displayName\}/);
  });
});

describe('V73.NE4 — Widget wires hook openNameEdit to Panel', () => {
  it('NE4.1 Widget passes chat.openNameEdit to Panel as onEditName', () => {
    expect(widget).toMatch(/onEditName=\{chat\.openNameEdit\}/);
  });

  it('NE4.2 Widget passes chat.displayName to Panel', () => {
    expect(widget).toMatch(/displayName=\{chat\.displayName\}/);
  });

  it('NE4.3 NamePicker initialValue from chat.displayName when nameEditMode', () => {
    expect(widget).toMatch(/initialValue=\{chat\.nameEditMode\s*\?\s*chat\.displayName\s*:\s*''\}/);
  });

  it('NE4.4 NamePicker cancel routes to closeNameEdit in edit mode', () => {
    expect(widget).toMatch(/chat\.nameEditMode\s*\?\s*chat\.closeNameEdit/);
  });
});

describe('V73.NE5 — useStaffChat hook surface for name-edit', () => {
  it('NE5.1 hook init currentDisplayName from getDisplayName()', () => {
    expect(hook).toMatch(/useState\(\(\)\s*=>\s*getDisplayName\(\)\)/);
  });

  it('NE5.2 hook returns displayName + nameEditMode + openNameEdit + closeNameEdit', () => {
    expect(hook).toMatch(/displayName:\s*currentDisplayName/);
    expect(hook).toMatch(/nameEditMode/);
    expect(hook).toMatch(/openNameEdit/);
    expect(hook).toMatch(/closeNameEdit/);
  });

  it('NE5.3 openNameEdit sets both nameEditMode + namePickerOpen true', () => {
    expect(hook).toMatch(/setNameEditMode\(true\)[\s\S]{0,100}setNamePickerOpen\(true\)/);
  });

  it('NE5.4 confirmName updates currentDisplayName state for re-render', () => {
    expect(hook).toMatch(/setCurrentDisplayName\(name\)/);
  });

  it('NE5.5 confirmName clears nameEditMode after save', () => {
    expect(hook).toMatch(/setNameEditMode\(false\)/);
  });
});

describe('V73.NE6 — Immutability contract: past messages keep stored displayName', () => {
  it('NE6.1 confirmName does NOT touch existing messages in state', () => {
    // setDisplayName updates localStorage only; no messages.map/filter rewrite
    const cn = hook.match(/const confirmName[\s\S]+?\}\,\s*\[/);
    expect(cn).toBeTruthy();
    // confirmName body should NOT call setMessages
    expect(cn[0]).not.toMatch(/setMessages\(/);
  });

  it('NE6.2 NamePicker description tells user past messages keep old name', () => {
    expect(picker).toMatch(/ข้อความเก่าจะยังเป็นชื่อเดิม/);
  });
});
