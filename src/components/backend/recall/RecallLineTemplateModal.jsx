import React, { useState, useEffect, useMemo } from 'react';
import { X, MessageCircle } from 'lucide-react';
import {
  DEFAULT_RECALL_TEMPLATES,
  renderTemplate,
  getRecallTemplateVariables,
} from '../../../lib/lineTemplateRenderer.js';
import { recordRecallLineSend } from '../../../lib/scopedDataLayer.js';
import { auth } from '../../../firebase.js';

/**
 * Phase 29 (2026-05-14) — LINE template send modal.
 * Per spec §4.6 + §5.9.
 *
 * 3 default templates (DEFAULT_RECALL_TEMPLATES):
 *   - recall-default (📅 ครบรอบ)
 *   - aftercare-followup (💉 ติดตามผล)
 *   - custom (✏️ ข้อความเอง — textarea opens)
 *
 * Variables auto-substituted via renderTemplate. Send button POSTs to
 * /api/admin/line-send-recall (admin-token gated). On success calls
 * recordRecallLineSend() to stamp the recall doc + closes optimistically.
 *
 * Customers without lineUserId never see this modal — parent gates the
 * button (RecallRow hides the 💬 chip).
 *
 * @param {object} props
 * @param {object} props.recall full recall doc (id + customerLineUserId required)
 * @param {object} props.customer { displayName, firstName, ... }
 * @param {function} props.onClose () => void
 * @param {function} [props.onSent] (messageId) => void
 */
export function RecallLineTemplateModal({ recall, customer, onClose, onSent }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // ESC closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Variable map computed once per (recall, customer) change
  const vars = useMemo(
    () => getRecallTemplateVariables(recall, customer),
    [recall, customer],
  );

  const selectedTemplate = DEFAULT_RECALL_TEMPLATES.find(t => t.id === selectedTemplateId) || null;
  const isCustom = selectedTemplateId === 'custom';

  // Final message text: rendered template OR custom textarea
  const finalText = isCustom
    ? customText
    : (selectedTemplate ? renderTemplate(selectedTemplate.text, vars) : '');

  const canSend = !!selectedTemplate && finalText.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setError('');
    setSending(true);
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/admin/line-send-recall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken || ''}`,
        },
        body: JSON.stringify({
          recallId: recall.id,
          customerLineUserId: recall.customerLineUserId,
          templateId: selectedTemplateId,
          messageText: finalText,
          branchId: recall.branchId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `ส่ง LINE ไม่สำเร็จ (${res.status})`);
      }

      // Stamp the recall doc with line-send fields
      try {
        await recordRecallLineSend(recall.id, {
          templateId: selectedTemplateId,
          messageText: finalText,
        });
      } catch (stampErr) {
        // Non-fatal — message already sent; stamp will retry on next listener event
        console.warn('[RecallLineTemplateModal] stamp failed (continuing):', stampErr);
      }

      onSent?.(data.messageId);
      onClose?.();
    } catch (ex) {
      console.error('[RecallLineTemplateModal] send failed:', ex);
      setError(ex?.message || 'ส่ง LINE ไม่สำเร็จ');
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="recall-line-template-modal"
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--bd)] px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--tx-primary)] flex items-center gap-2">
            <MessageCircle size={14} className="text-green-300" />
            ส่งข้อความ LINE · {recall?.customerName || customer?.displayName || '—'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-line-close"
            className="w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)]"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Template picker */}
          <p className="text-[11px] font-bold text-[var(--tx-muted)] uppercase tracking-wider">
            เลือก template <span className="text-red-300">*</span>
          </p>
          <div className="space-y-1.5" data-testid="recall-line-template-cards">
            {DEFAULT_RECALL_TEMPLATES.map(tpl => {
              const selected = selectedTemplateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  data-testid={`recall-line-template-${tpl.id}`}
                  data-selected={selected ? 'true' : 'false'}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                    selected
                      ? 'bg-green-500/15 border-green-500 border-2'
                      : 'bg-[var(--bg-surface)] border-[var(--bd)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="text-xs font-bold text-[var(--tx-primary)]">{tpl.label}</div>
                  {tpl.text && (
                    <div className="text-[10px] text-[var(--tx-muted)] mt-0.5 line-clamp-2">{tpl.text}</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom text area (only when 'custom' selected) */}
          {isCustom && (
            <div data-field="customText">
              <label className="block text-[11px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
                เขียนข้อความเอง
              </label>
              <textarea
                rows={5}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                maxLength={5000}
                placeholder="พิมพ์ข้อความที่ต้องการส่งไป LINE"
                data-testid="recall-line-custom-text"
                className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-green-500 resize-none"
              />
            </div>
          )}

          {/* Preview (auto-rendered) */}
          {selectedTemplate && !isCustom && (
            <div
              data-testid="recall-line-preview"
              className="px-3 py-2 rounded-lg bg-green-500/[0.06] border border-green-500/25 border-dashed text-[11px] text-[var(--tx-primary)] whitespace-pre-wrap"
            >
              <div className="text-[9px] text-green-300 font-bold mb-1 uppercase">👁 ตัวอย่างข้อความ</div>
              {finalText}
            </div>
          )}

          {/* LINE-linked hint */}
          <div className="text-[10px] text-[var(--tx-muted)] italic px-2 py-1.5 bg-[var(--bg-surface)] rounded">
            ✓ ลูกค้าผูก LINE แล้ว · variables auto-fill จากข้อมูลลูกค้า · กด "ส่ง" = ส่งทันที + บันทึกใน chat history
          </div>

          {error && (
            <div
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300"
              data-testid="recall-line-error"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--bd)] px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-line-cancel"
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]"
            disabled={sending}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            data-testid="recall-line-send"
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <MessageCircle size={12} />
            {sending ? 'กำลังส่ง…' : '📤 ส่งข้อความ'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecallLineTemplateModal;
