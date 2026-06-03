// tests/staffchat-upload-orphan-cleanup.test.jsx
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop), client D. The send pipeline mints
// messageId FIRST, uploads attachments/sticker to staff-chat-attachments/{branchId}/
// {messageId}/, THEN creates the Firestore doc. If a LATER step fails the uploaded
// blobs are orphaned (no message doc points at them) — they only disappear when the
// 30-day retention sweep runs (Pass B, which S1 just made reliable). The send is
// atomic from the user's POV (no half-message), but the source leaks Storage
// objects. Clean them at the source instead of waiting for the backstop. (AV188.)
//
// Class-of-bug = "uploaded-then-orphaned on a later failure in the same send flow":
//   Site A — prepareAndUpload: a PARTIAL upload failure → the composer returns
//            without sending → the SUCCESSFUL uploads under {messageId}/ are orphaned
//            (and a retry mints a NEW messageId → the 1st attempt is orphaned even on
//            a successful retry).
//   Site B — send()'s addStaffChatMessage(.catch): the doc-create fails AFTER the
//            attachments/sticker were uploaded (send swallows its own addDoc error)
//            → the blobs under {doc.id}/ are orphaned. Covers BOTH the multi-attachment
//            send path AND the custom-sticker path (sendSticker → send).
//
// Fix: a shared deleteStaffChatAttachmentFolder(branchId, messageId) (folder-sweep
// only, extracted from deleteStaffChatMessage — Rule of 3) called best-effort at
// both sites. Text-only / all-cancelled flows clean nothing (no orphan).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

let currentBranchId = 'BR-A';
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: currentBranchId }),
}));

const addStaffChatMessage = vi.fn(() => Promise.resolve('CHAT-x'));
const deleteStaffChatAttachmentFolder = vi.fn(() => Promise.resolve());
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToStaffChatMessages: vi.fn(() => () => {}),
  addStaffChatMessage: (...a) => addStaffChatMessage(...a),
  deleteStaffChatMessage: vi.fn(() => Promise.resolve()),
  deleteStaffChatAttachmentFolder: (...a) => deleteStaffChatAttachmentFolder(...a),
}));

const uploadStaffChatFile = vi.fn();
vi.mock('../src/lib/staffChatImageResize.js', () => ({
  uploadAttachment: vi.fn(() => Promise.resolve({})),
  uploadStaffChatFile: (...a) => uploadStaffChatFile(...a),
  STAFF_CHAT_MAX_ATTACHMENTS: 10,
}));

import { useStaffChat } from '../src/hooks/useStaffChat.js';
import { setDisplayName } from '../src/lib/staffChatIdentity.js';

const att = (fullPath) => ({ kind: 'image', fullPath, name: fullPath.split('/').pop(), fullUrl: 'u', thumbUrl: 't', w: 1, h: 1, sizeBytes: 1, contentType: 'image/png' });

describe('D — send-path uploaded-then-orphaned cleanup', () => {
  beforeEach(() => {
    currentBranchId = 'BR-A';
    localStorage.clear();
    setDisplayName('เอ'); // pass send()'s name gate
    addStaffChatMessage.mockReset().mockResolvedValue('CHAT-x');
    deleteStaffChatAttachmentFolder.mockReset().mockResolvedValue();
    uploadStaffChatFile.mockReset();
  });

  it('D1 (Site A) a PARTIAL upload failure cleans the orphaned successful uploads', async () => {
    // file 0 succeeds, file 1 fails → the composer would return without sending →
    // file 0's blob (under {messageId}/) is an orphan → must be swept at the source.
    uploadStaffChatFile
      .mockResolvedValueOnce(att('staff-chat-attachments/BR-A/MID/a.png'))
      .mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useStaffChat());
    let r;
    await act(async () => {
      r = await result.current.prepareAndUpload([{ name: 'a.png' }, { name: 'b.png' }], null, null, { current: new Set() });
    });
    expect(r.failed).toHaveLength(1);            // file 1 failed
    expect(r.attachments).toHaveLength(1);        // file 0 uploaded (the orphan)
    expect(deleteStaffChatAttachmentFolder).toHaveBeenCalledTimes(1);
    expect(deleteStaffChatAttachmentFolder).toHaveBeenCalledWith('BR-A', r.messageId);
  });

  it('D2 (Site A) ALL uploads succeed → no cleanup (the message will send)', async () => {
    uploadStaffChatFile
      .mockResolvedValueOnce(att('staff-chat-attachments/BR-A/MID/a.png'))
      .mockResolvedValueOnce(att('staff-chat-attachments/BR-A/MID/b.png'));
    const { result } = renderHook(() => useStaffChat());
    let r;
    await act(async () => {
      r = await result.current.prepareAndUpload([{ name: 'a.png' }, { name: 'b.png' }], null, null, { current: new Set() });
    });
    expect(r.failed).toHaveLength(0);
    expect(deleteStaffChatAttachmentFolder).not.toHaveBeenCalled();
  });

  it('D3 (Site B) doc-create fails AFTER attachments uploaded → folder swept', async () => {
    addStaffChatMessage.mockRejectedValue(new Error('permission-denied'));
    const { result } = renderHook(() => useStaffChat());
    await act(async () => {
      await result.current.send('hi', { id: 'M2', attachments: [att('staff-chat-attachments/BR-A/M2/a.png')] });
    });
    expect(deleteStaffChatAttachmentFolder).toHaveBeenCalledWith('BR-A', 'M2');
  });

  it('D4 (Site B) doc-create fails AFTER a custom sticker uploaded → folder swept', async () => {
    addStaffChatMessage.mockRejectedValue(new Error('permission-denied'));
    const { result } = renderHook(() => useStaffChat());
    await act(async () => {
      await result.current.send('', { id: 'M3', sticker: { kind: 'custom', url: 'u', storagePath: 'staff-chat-attachments/BR-A/M3/sticker.png' } });
    });
    expect(deleteStaffChatAttachmentFolder).toHaveBeenCalledWith('BR-A', 'M3');
  });

  it('D5 (Site B) a TEXT-ONLY doc-create failure cleans NOTHING (no orphan exists)', async () => {
    addStaffChatMessage.mockRejectedValue(new Error('permission-denied'));
    const { result } = renderHook(() => useStaffChat());
    await act(async () => {
      await result.current.send('just text', { id: 'M4' });
    });
    expect(deleteStaffChatAttachmentFolder).not.toHaveBeenCalled();
  });

  it('D6 (Site B) a SUCCESSFUL attachment send cleans NOTHING', async () => {
    addStaffChatMessage.mockResolvedValue('CHAT-ok');
    const { result } = renderHook(() => useStaffChat());
    await act(async () => {
      await result.current.send('hi', { id: 'M5', attachments: [att('staff-chat-attachments/BR-A/M5/a.png')] });
    });
    expect(deleteStaffChatAttachmentFolder).not.toHaveBeenCalled();
  });
});

describe('D-SG — source-grep regression lock', () => {
  const read = (p) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  const H = read('../src/hooks/useStaffChat.js');
  const BC = read('../src/lib/backendClient.js');
  const SDL = read('../src/lib/scopedDataLayer.js');

  it('SG1 backendClient exports deleteStaffChatAttachmentFolder + deleteStaffChatMessage reuses it', () => {
    expect(BC).toMatch(/export async function deleteStaffChatAttachmentFolder/);
    // deleteStaffChatMessage no longer inlines the listAll/deleteObject sweep —
    // it calls the extracted helper.
    expect(BC).toMatch(/await deleteStaffChatAttachmentFolder\(branchId, messageId\)/);
  });
  it('SG2 scopedDataLayer re-exports deleteStaffChatAttachmentFolder', () => {
    expect(SDL).toMatch(/export const deleteStaffChatAttachmentFolder/);
  });
  it('SG3 prepareAndUpload cleans on partial failure (Site A)', () => {
    expect(H).toMatch(/deleteStaffChatAttachmentFolder/);
    // the cleanup is gated on there being successful uploads + failures
    expect(H).toMatch(/failed\.length\s*>\s*0[\s\S]{0,200}deleteStaffChatAttachmentFolder/);
  });
  it('SG4 send catch cleans when the doc carried Storage objects (Site B)', () => {
    // inside the addStaffChatMessage(.catch) — guarded by attachments/sticker.storagePath
    expect(H).toMatch(/\.catch\(\(e\)\s*=>\s*\{[\s\S]*?deleteStaffChatAttachmentFolder\(/);
    expect(H).toMatch(/sticker\s*&&\s*[\s\S]{0,40}storagePath|storagePath[\s\S]{0,40}attachments/);
  });
});
