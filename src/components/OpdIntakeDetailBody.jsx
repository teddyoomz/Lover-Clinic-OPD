// OpdIntakeDetailBody (2026-07-04, spec ⑤) — the intake patientData display
// grid EXTRACTED VERBATIM from AdminDashboard renderViewingSessionModal
// (was inline at AdminDashboard.jsx ~:5048-5164) so TWO surfaces share ONE
// body (V127 shared-detail-body pattern — no sibling drift):
//   1. AdminDashboard "ประวัติผู้ป่วย OPD" modal (queue "ดูข้อมูล")
//   2. StaffChatIntakeModal (staff-chat intake card "ดูข้อมูลรับเข้า" button)
//
// Accepts BOTH a live opd_sessions doc AND a __synthetic session built from
// be_customers.patientData via synthesizeSessionFromCustomer (booking-flow
// sessions are HARD-DELETED after registration — AV131). Pure display: no
// mutations, no session writes; interactive extras (edit/print/copy buttons,
// assessments, deposit, timeline) stay with each host.
import { CreditCard, Globe, Clock } from 'lucide-react';
import PhoneLink from './PhoneLink.jsx';
import {
  getReasons, getHrtGoals, renderDobFormat,
  formatPhoneNumberDisplay, generateClinicalSummary,
} from '../utils.js';

/**
 * @param {object} props
 * @param {object} props.session opd_sessions doc shape (or __synthetic)
 * @param {boolean} [props.showClinicalSummary=false] append a read-only
 *        generateClinicalSummary textarea (the chat modal uses this; the
 *        AdminDashboard host keeps its own richer copy/lang block)
 */
export function OpdIntakeDetailBody({ session, showClinicalSummary = false }) {
  const viewingSession = session || {};
  const d = viewingSession.patientData || {};
  const formType = viewingSession.formType || 'intake';
  const isFollowUp = formType.startsWith('followup_');
  const isCustom = formType === 'custom';
  const reasons = getReasons(d);
  const goals = getHrtGoals(d);
  const isHrt = reasons.includes('เสริมฮอร์โมน') || formType === 'followup_adam' || formType === 'followup_mrs';

  return (
    <>
      {!viewingSession.patientData && (
        <div className="p-12 text-center text-gray-600 flex flex-col items-center gap-4 mb-6">
          <Clock size={36} className="opacity-30" />
          <p className="text-sm font-bold text-gray-400">รอลูกค้ากรอกข้อมูล...</p>
          <p className="text-xs text-gray-600">ลูกค้ายังไม่ได้กรอกแบบฟอร์ม</p>
        </div>
      )}
      <div className={`grid grid-cols-1 ${isFollowUp || isCustom ? '' : 'md:grid-cols-2'} gap-6`} style={viewingSession.patientData ? {} : { display: 'none' }}>

        <div className="space-y-6">
          <div className="bg-[var(--bg-card)] p-4 sm:p-5 rounded-xl border border-[var(--bd)] shadow-inner relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-600"></div>
            <h4 className="text-xs font-black text-gray-500 font-semibold border-b border-[var(--bd)] pb-2 mb-4">ข้อมูลส่วนตัว</h4>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">ชื่อ-สกุล:</span><span className="col-span-2 font-bold text-white break-words">{d.prefix !== 'ไม่ระบุ' ? d.prefix : ''} {d.firstName} {d.lastName}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">เพศ:</span><span className="col-span-2 font-bold text-white">{d.gender || '-'}</span></div>
              <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">วันเกิด:</span><span className="col-span-2 font-bold text-white">{renderDobFormat(d)} <span className="text-red-500 font-mono text-xs ml-2">[{d.age} ปี]</span></span></div>
              {d.idCard && (
                <div className="grid grid-cols-3 gap-2"><span className="text-gray-500 flex items-center gap-1"><CreditCard size={12}/> บัตร/Passport:</span><span className="col-span-2 font-bold text-white font-mono">{d.idCard.length === 13 ? d.idCard.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, '$1-$2-$3-$4-$5') : d.idCard}</span></div>
              )}

              {(isFollowUp || isCustom) && (
                <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">วันที่ประเมิน:</span><span className="col-span-2 font-bold text-orange-400">{d.assessmentDate || '-'}</span></div>
              )}

              {!isFollowUp && !isCustom && (
                <>
                  <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">สัญชาติ:</span><span className="col-span-2 font-bold text-white">{d.nationality === 'ต่างชาติ' ? (d.nationalityCountry || 'ต่างชาติ') : 'ไทย'}</span></div>
                  <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">โทรศัพท์:</span><PhoneLink value={formatPhoneNumberDisplay(d.phone, d.isInternationalPhone, d.phoneCountryCode)} className="col-span-2 font-bold text-white font-mono break-all">{formatPhoneNumberDisplay(d.phone, d.isInternationalPhone, d.phoneCountryCode)}</PhoneLink></div>
                  <div className="grid grid-cols-3 gap-2"><span className="text-gray-500">ที่อยู่:</span><span className="col-span-2 font-bold text-gray-300 text-xs leading-relaxed break-words">{[d.address, d.subDistrict && `ต.${d.subDistrict}`, d.district && `อ.${d.district}`, d.province, d.postalCode].filter(Boolean).join(' ') || '-'}</span></div>
                </>
              )}
            </div>
          </div>

          {!isFollowUp && !isCustom && (
            <div className="bg-[var(--bg-card)] p-4 sm:p-5 rounded-xl border border-orange-900/30">
              <h4 className="text-xs font-black text-orange-600 font-semibold border-b border-orange-900/30 pb-2 mb-4">ติดต่อฉุกเฉิน</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-orange-500/50">ชื่อ-สกุล:</span><span className="font-bold text-orange-200">{d.emergencyName || '-'}</span></div>
                <div className="flex justify-between"><span className="text-orange-500/50">ความสัมพันธ์:</span><span className="font-bold text-orange-200">{d.emergencyRelation || '-'}</span></div>
                <div className="flex justify-between"><span className="text-orange-500/50">โทรศัพท์:</span><PhoneLink value={formatPhoneNumberDisplay(d.emergencyPhone, d.isInternationalEmergencyPhone, d.emergencyPhoneCountryCode)} className="font-bold font-mono text-orange-200 break-all">{formatPhoneNumberDisplay(d.emergencyPhone, d.isInternationalEmergencyPhone, d.emergencyPhoneCountryCode)}</PhoneLink></div>
              </div>
            </div>
          )}
        </div>

        {!isFollowUp && !isCustom && (
          <div className="space-y-6">
            <div className="bg-[var(--bg-card)] p-4 sm:p-5 rounded-xl border border-[var(--bd)] shadow-inner relative overflow-hidden h-full">
              <div className="absolute top-0 left-0 w-1 h-full bg-gray-700"></div>
              <h4 className="text-xs font-black text-gray-500 font-semibold border-b border-[var(--bd)] pb-2 mb-4">ข้อมูลสุขภาพพื้นฐาน</h4>
              <div className="mb-5">
                <span className="text-xs text-gray-500 block mb-2">สาเหตุที่มาพบแพทย์</span>
                <div className="flex flex-col gap-2 font-black text-white bg-[var(--bg-hover)] p-3 rounded border border-[var(--bd-strong)] font-semibold text-sm border-l-2 border-l-red-600 mb-2">
                  {reasons.map(r => (
                    <div key={r} className="break-words">• {r === 'อื่นๆ' ? `อื่นๆ: ${d.visitReasonOther}` : r}</div>
                  ))}
                </div>
                {isHrt && goals.length > 0 && (
                  <div className="bg-[var(--bg-card)] p-3 rounded border border-[var(--bd-strong)] mt-2">
                    <span className="text-xs text-gray-500 uppercase block mb-2">เป้าหมายการเสริมฮอร์โมน</span>
                    <div className="flex flex-wrap gap-1.5">
                      {goals.map(g => (
                        <span key={g} className="font-bold text-orange-400 text-xs bg-orange-950/20 border border-orange-900/30 px-2 py-0.5 rounded break-words max-w-full">
                          {g === 'ฮอร์โมนเพื่อการข้ามเพศ' ? `ข้ามเพศ (${d.hrtTransType})` : g === 'อื่นๆ' ? `อื่นๆ (${d.hrtOtherDetail})` : g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className={`p-3 rounded border ${d.hasAllergies === 'มี' ? 'bg-red-950/20 border-red-900/50' : 'bg-[var(--bg-card)] border-[var(--bd)]'}`}>
                  <span className={`text-xs font-semibold block mb-1 ${d.hasAllergies === 'มี' ? 'text-red-500' : 'text-gray-500'}`}>ประวัติแพ้ยา/อาหาร</span>
                  <span className={`font-bold text-sm break-words ${d.hasAllergies === 'มี' ? 'text-red-400' : 'text-gray-300'}`}>{d.hasAllergies === 'มี' ? d.allergiesDetail : 'ไม่มี'}</span>
                </div>
                <div className={`p-3 rounded border ${d.hasUnderlying === 'มี' ? 'bg-orange-950/20 border-orange-900/50' : 'bg-[var(--bg-card)] border-[var(--bd)]'}`}>
                  <span className={`text-xs font-semibold block mb-1 ${d.hasUnderlying === 'มี' ? 'text-orange-500' : 'text-gray-500'}`}>โรคประจำตัว</span>
                  <span className={`font-bold text-sm leading-relaxed break-words ${d.hasUnderlying === 'มี' ? 'text-orange-300' : 'text-gray-300'}`}>
                    {d.hasUnderlying === 'มี' ? (
                      <ul className="list-disc pl-4 space-y-1">
                        {d.ud_hypertension && <li>ความดันโลหิตสูง</li>}
                        {d.ud_diabetes && <li>เบาหวาน</li>}
                        {d.ud_lung && <li>โรคปอด</li>}
                        {d.ud_kidney && <li>โรคไต</li>}
                        {d.ud_heart && <li>โรคหัวใจ</li>}
                        {d.ud_blood && <li>โรคโลหิต</li>}
                        {d.ud_other && <li>{d.ud_otherDetail}</li>}
                      </ul>
                    ) : 'ไม่มี'}
                  </span>
                </div>
                <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--bd)]">
                  <span className="text-xs text-gray-500 font-semibold block mb-1">ยาที่ใช้ประจำ</span>
                  {/* (bug-hunt R1 #4/#6) synthetic sessions: the canonical customer
                      shape NEVER carries currentMedication — "unknown" must render
                      '-', never assert "ไม่มี" on a medical view. Real kiosk
                      sessions keep the explicit ไม่มี default. */}
                  <span className="font-bold text-sm text-gray-300 break-words">{d.currentMedication || (viewingSession.__synthetic ? '-' : 'ไม่มี')}</span>
                </div>
                {d.bloodType && d.bloodType !== 'ไม่ทราบ' && (
                  <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--bd)]">
                    <span className="text-xs text-gray-500 font-semibold block mb-1">กรุ๊ปเลือด</span>
                    <span className="font-bold text-sm text-gray-300">{d.bloodType}</span>
                  </div>
                )}
                {d.pregnancy && d.pregnancy !== 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์' && (
                  <div className={`p-3 rounded border ${d.pregnancy === 'กำลังตั้งครรภ์' ? 'bg-pink-950/20 border-pink-900/50' : 'bg-[var(--bg-card)] border-[var(--bd)]'}`}>
                    <span className={`text-xs font-semibold block mb-1 ${d.pregnancy === 'กำลังตั้งครรภ์' ? 'text-pink-500' : 'text-gray-500'}`}>การตั้งครรภ์</span>
                    <span className={`font-bold text-sm ${d.pregnancy === 'กำลังตั้งครรภ์' ? 'text-pink-300' : 'text-gray-300'}`}>{d.pregnancy}</span>
                  </div>
                )}
                {d.howFoundUs && d.howFoundUs.length > 0 && (
                  <div className="p-3 bg-[var(--bg-elevated)] rounded border border-blue-900/30">
                    <span className="text-xs text-blue-500 font-semibold block mb-2 flex items-center gap-1"><Globe size={10}/> รู้จักคลินิกจาก</span>
                    <div className="flex flex-wrap gap-1.5">
                      {d.howFoundUs.map(ch => (
                        <span key={ch} className="text-xs font-bold text-blue-300 bg-blue-950/30 border border-blue-900/40 px-2.5 py-1 rounded-full">{ch}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showClinicalSummary && viewingSession.patientData && !isCustom && (
        <div className="mt-6">
          <h4 className="text-xs font-black text-gray-500 font-semibold mb-2">Clinical Summary</h4>
          <textarea
            readOnly
            value={generateClinicalSummary(d, formType, viewingSession.customTemplate, 'th')}
            className="w-full bg-[var(--bg-surface)] border border-[var(--bd)] text-gray-300 rounded-lg p-3 sm:p-4 text-xs font-mono resize-none outline-none leading-relaxed"
            rows={8}
            data-testid="intake-clinical-summary"
          />
        </div>
      )}
    </>
  );
}

export default OpdIntakeDetailBody;
