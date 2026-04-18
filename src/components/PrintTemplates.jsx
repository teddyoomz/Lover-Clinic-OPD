import ClinicLogo from './ClinicLogo.jsx';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';
import {
  generateClinicalSummary, getReasons, getHrtGoals,
  calculateADAM, calculateIIEFScore, calculateMRS,
  getIIEFInterpretation, formatPhoneNumberDisplay
} from '../utils.js';

export function OfficialOPDPrint({ session, clinicSettings = {} }) {
  const cs = { ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings };
  const d = session.patientData;
  const formType = session.formType || 'intake';
  const summary = generateClinicalSummary(d, formType, session.customTemplate);
  const formattedDate = session.createdAt ? session.createdAt.toDate().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'long', day: 'numeric' }) : '-';
  const formattedTime = session.createdAt ? session.createdAt.toDate().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '-';
  const isFollowUp = formType.startsWith('followup_');
  const isCustom = formType === 'custom';
  const ac = cs.accentColor || '#dc2626';

  const docTitle = isCustom ? 'แบบฟอร์มกำหนดเอง' : isFollowUp ? 'แบบรายงานติดตาม' : 'บันทึก OPD';
  const docSubtitle = isCustom ? 'CUSTOM FORM' : isFollowUp ? 'FOLLOW-UP RECORD' : 'OPD RECORD';

  const sectionStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '12px',
    overflow: 'hidden',
    pageBreakInside: 'avoid',
  };
  const sectionHeaderStyle = {
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    padding: '6px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };
  const sectionTitleStyle = {
    fontSize: '9px',
    fontWeight: '800',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: ac,
    margin: 0,
  };
  const sectionBodyStyle = { padding: '12px 14px' };

  return (
    <div style={{ background: '#fff', color: '#0f172a', fontFamily: 'sans-serif', width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '0' }}>

      {/* ── Accent top bar ── */}
      <div style={{ height: '6px', background: `linear-gradient(90deg, ${ac}, ${ac}99)`, width: '100%' }} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', padding: '16px 24px 12px', borderBottom: '1px solid #e2e8f0', gap: '20px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', minWidth: '80px' }}>
          <ClinicLogo className="h-14" showText={false} printMode={true} clinicSettings={cs} />
        </div>

        {/* Clinic info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
          <div style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a', letterSpacing: '0.02em' }}>{cs.clinicName || 'Lover Clinic'}</div>
          {cs.clinicSubtitle && <div style={{ fontSize: '9px', color: '#64748b', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '2px' }}>{cs.clinicSubtitle}</div>}
        </div>

        {/* Document type */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '17px', fontWeight: '900', color: ac, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{docTitle}</div>
          <div style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '3px' }}>{docSubtitle}</div>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '9px', background: '#f1f5f9', borderRadius: '4px', padding: '3px 8px', fontFamily: 'monospace', color: '#334155', fontWeight: '700' }}>
              HN: {session.sessionId || session.id}
            </div>
            <div style={{ fontSize: '9px', color: '#64748b' }}>{formattedDate} · {formattedTime}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 24px 24px' }}>

        {/* ── Patient info ── */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px', flexShrink: 0 }} />
            <h3 style={sectionTitleStyle}>ข้อมูลผู้ป่วย (Patient Information)</h3>
          </div>
          <div style={{ ...sectionBodyStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: '11px' }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '6px', alignItems: 'baseline' }}>
              <span style={{ color: '#64748b', minWidth: '70px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ชื่อ-สกุล</span>
              <span style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{d.prefix !== 'ไม่ระบุ' ? d.prefix + ' ' : ''}{d.firstName} {d.lastName}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ color: '#64748b', minWidth: '50px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>อายุ</span>
              <span style={{ fontWeight: '700' }}>{d.age} ปี</span>
            </div>
            {(!isFollowUp && !isCustom) && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#64748b', minWidth: '50px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>เพศ</span>
                <span style={{ fontWeight: '700' }}>{d.gender}</span>
              </div>
            )}
            {(isFollowUp || isCustom) && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#64748b', minWidth: '80px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>วันที่ประเมิน</span>
                <span style={{ fontWeight: '700' }}>{d.assessmentDate || '-'}</span>
              </div>
            )}
            {(!isFollowUp && !isCustom) && (
              <>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ color: '#64748b', minWidth: '70px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>วันเกิด</span>
                  <span style={{ fontWeight: '700' }}>{d.dobDay && d.dobMonth && d.dobYear ? `${d.dobDay}/${d.dobMonth}/${d.dobYear}` : '-'}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ color: '#64748b', minWidth: '70px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>สัญชาติ</span>
                  <span style={{ fontWeight: '700' }}>{d.nationality === 'ต่างชาติ' ? (d.nationalityCountry || 'ต่างชาติ') : 'ไทย'}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ color: '#64748b', minWidth: '70px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>โทรศัพท์</span>
                  <span style={{ fontWeight: '700' }}>{formatPhoneNumberDisplay(d.phone, d.isInternationalPhone, d.phoneCountryCode)}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ color: '#64748b', minWidth: '70px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ฉุกเฉิน</span>
                  <span style={{ fontWeight: '700' }}>{d.emergencyName || '-'}{d.emergencyRelation ? ` (${d.emergencyRelation})` : ''} · {formatPhoneNumberDisplay(d.emergencyPhone, d.isInternationalEmergencyPhone, d.emergencyPhoneCountryCode)}</span>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '6px' }}>
                  <span style={{ color: '#64748b', minWidth: '70px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ที่อยู่</span>
                  <span style={{ fontWeight: '700' }}>{[d.address, d.subDistrict && `ต.${d.subDistrict}`, d.district && `อ.${d.district}`, d.province, d.postalCode].filter(Boolean).join(' ') || '-'}</span>
                </div>
                {d.currentMedication && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '6px' }}>
                    <span style={{ color: '#64748b', minWidth: '70px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ยาปัจจุบัน</span>
                    <span style={{ fontWeight: '700' }}>{d.currentMedication}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Allergy + Underlying ── */}
        {(!isFollowUp && !isCustom) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            {/* Allergy */}
            <div style={{ ...sectionStyle, marginBottom: 0, border: d.hasAllergies === 'มี' ? `1.5px solid #fca5a5` : '1px solid #e2e8f0', background: d.hasAllergies === 'มี' ? '#fff5f5' : '#fff' }}>
              <div style={{ ...sectionHeaderStyle, background: d.hasAllergies === 'มี' ? '#fee2e2' : '#f8fafc', borderBottom: d.hasAllergies === 'มี' ? '1px solid #fca5a5' : '1px solid #e2e8f0' }}>
                <div style={{ width: '3px', height: '12px', background: d.hasAllergies === 'มี' ? '#ef4444' : '#94a3b8', borderRadius: '2px' }} />
                <h3 style={{ ...sectionTitleStyle, color: d.hasAllergies === 'มี' ? '#dc2626' : '#94a3b8' }}>Allergies / แพ้ยา-อาหาร</h3>
              </div>
              <div style={sectionBodyStyle}>
                {d.hasAllergies === 'มี' ? (
                  <div style={{ fontWeight: '800', fontSize: '13px', color: '#dc2626' }}>⚠ {d.allergiesDetail}</div>
                ) : (
                  <div style={{ fontWeight: '700', fontSize: '11px', color: '#475569' }}>NKDA — ปฏิเสธประวัติแพ้ยา</div>
                )}
              </div>
            </div>
            {/* Underlying */}
            <div style={{ ...sectionStyle, marginBottom: 0 }}>
              <div style={sectionHeaderStyle}>
                <div style={{ width: '3px', height: '12px', background: d.hasUnderlying === 'มี' ? '#f97316' : '#94a3b8', borderRadius: '2px' }} />
                <h3 style={{ ...sectionTitleStyle, color: d.hasUnderlying === 'มี' ? '#ea580c' : '#94a3b8' }}>Underlying Diseases / โรคประจำตัว</h3>
              </div>
              <div style={sectionBodyStyle}>
                {d.hasUnderlying === 'มี' ? (
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#0f172a', lineHeight: '1.8' }}>
                    {[d.ud_hypertension && 'ความดันโลหิตสูง', d.ud_diabetes && 'เบาหวาน', d.ud_lung && 'โรคปอด', d.ud_kidney && 'โรคไต', d.ud_heart && 'โรคหัวใจ', d.ud_blood && 'โรคโลหิต', d.ud_other && d.ud_otherDetail].filter(Boolean).map((item, i) => (
                      <span key={i} style={{ display: 'inline-block', marginRight: '6px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '4px', padding: '1px 6px', marginBottom: '3px' }}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontWeight: '700', fontSize: '11px', color: '#475569' }}>ปฏิเสธโรคประจำตัว</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Vital Signs ── */}
        {(!isCustom) && (
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px' }} />
              <h3 style={sectionTitleStyle}>Vital Signs</h3>
            </div>
            <div style={{ ...sectionBodyStyle, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px' }}>
              {[
                { label: 'Temp', unit: '°C' },
                { label: 'BP', unit: 'mmHg', wide: true },
                { label: 'HR', unit: '/min' },
                { label: 'RR', unit: '/min' },
                { label: 'Weight', unit: 'kg' },
                { label: 'Height', unit: 'cm' },
              ].map(v => (
                <div key={v.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700' }}>{v.label}</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ flex: 1, borderBottom: '1.5px solid #94a3b8', height: '20px' }} />
                    <span style={{ fontSize: '9px', color: '#64748b', paddingBottom: '2px' }}>{v.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Chief Complaint / Screening summary ── */}
        <div style={{ ...sectionStyle, minHeight: isCustom ? '180px' : '130px' }}>
          <div style={sectionHeaderStyle}>
            <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px' }} />
            <h3 style={sectionTitleStyle}>
              {isCustom ? 'สรุปคำตอบแบบประเมิน (Assessment Answers)' : isFollowUp ? 'สรุปผลการประเมิน (Follow-up Summary)' : 'อาการสำคัญ และ ประวัติปัจจุบัน (CC & Screening)'}
            </h3>
          </div>
          <div style={{ ...sectionBodyStyle, fontSize: '10px', lineHeight: '1.8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#1e293b' }}>
            {summary}
          </div>
        </div>

        {/* ── Clinical sections (blank for handwriting) ── */}
        {(!isCustom) && (
          <>
            <div style={{ ...sectionStyle, minHeight: '130px' }}>
              <div style={sectionHeaderStyle}>
                <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px' }} />
                <h3 style={sectionTitleStyle}>ตรวจร่างกาย (Physical Examination)</h3>
              </div>
              <div style={sectionBodyStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div style={{ ...sectionStyle, minHeight: '90px', marginBottom: 0 }}>
                <div style={sectionHeaderStyle}>
                  <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px' }} />
                  <h3 style={sectionTitleStyle}>การวินิจฉัย (Diagnosis / ICD)</h3>
                </div>
                <div style={sectionBodyStyle} />
              </div>
              <div style={{ ...sectionStyle, minHeight: '90px', marginBottom: 0 }}>
                <div style={sectionHeaderStyle}>
                  <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px' }} />
                  <h3 style={sectionTitleStyle}>การส่งตรวจ / Lab (Investigations)</h3>
                </div>
                <div style={sectionBodyStyle} />
              </div>
            </div>
            <div style={{ ...sectionStyle, minHeight: '160px' }}>
              <div style={sectionHeaderStyle}>
                <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px' }} />
                <h3 style={sectionTitleStyle}>แผนการรักษา (Treatment Plan / Prescription)</h3>
              </div>
              <div style={sectionBodyStyle} />
            </div>
          </>
        )}

        {/* ── Signature ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ textAlign: 'center', width: '220px' }}>
            <div style={{ height: '44px', borderBottom: `1.5px solid #94a3b8`, marginBottom: '6px' }} />
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#475569' }}>ผู้รับผิดชอบ / Responsible</div>
            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '6px' }}>
              ว/ด/ป ........ / ........ / ............
            </div>
            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>รหัส ........................</div>
          </div>
        </div>

        {/* ── Footer bar ── */}
        <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '8px', color: '#cbd5e1', letterSpacing: '0.1em' }}>{cs.clinicName} · CONFIDENTIAL RECORD</span>
          <span style={{ fontSize: '8px', color: '#cbd5e1', fontFamily: 'monospace' }}>{session.sessionId || session.id}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardOPDPrint({ session, clinicSettings = {} }) {
  const cs = { ...DEFAULT_CLINIC_SETTINGS, ...clinicSettings };
  const d = session.patientData;
  const formType = session.formType || 'intake';
  const isFollowUp = formType.startsWith('followup_');
  const isCustom = formType === 'custom';

  const reasons = getReasons(d);
  const goals = getHrtGoals(d);

  const showAdam = (!isFollowUp && !isCustom && (reasons.includes('สมรรถภาพทางเพศ') || goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้ชาย)'))) || formType === 'followup_adam';
  const showMrs  = (!isFollowUp && !isCustom && goals.includes('อาการฮอร์โมนตก/วัยทอง (ผู้หญิง)')) || formType === 'followup_mrs';
  const isPerf   = (!isFollowUp && !isCustom && reasons.includes('สมรรถภาพทางเพศ')) || formType === 'followup_ed';

  const formattedDate = session.createdAt ? session.createdAt.toDate().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'long', day: 'numeric' }) : '-';
  const formattedTime = session.createdAt ? session.createdAt.toDate().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '-';
  const ac = cs.accentColor || '#dc2626';

  /* ── Shared style helpers ── */
  const card = {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    overflow: 'hidden',
    pageBreakInside: 'avoid',
    marginBottom: '12px',
  };
  const cardHeader = (color = ac) => ({
    background: `linear-gradient(135deg, ${color}18, ${color}08)`,
    borderBottom: `1px solid ${color}30`,
    padding: '8px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });
  const cardTitle = (color = ac) => ({
    fontSize: '9px',
    fontWeight: '800',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color,
    margin: 0,
  });
  const cardBody = { padding: '12px 14px' };

  /* ── Score bar helper ── */
  const ScoreBar = ({ value, max, color }) => {
    const pct = Math.min(100, Math.round((value / max) * 100));
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}, ${color}99)`, borderRadius: '99px', transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: '11px', fontWeight: '800', color, minWidth: '40px', textAlign: 'right' }}>{value} <span style={{ color: '#94a3b8', fontWeight: '500' }}>/ {max}</span></span>
      </div>
    );
  };

  const reportTitle = isCustom
    ? (session.customTemplate?.title || 'แบบฟอร์มกำหนดเอง')
    : isFollowUp ? 'รายงานติดตามผล' : 'สรุป OPD';
  const reportSubtitle = isCustom ? 'Custom Form Report'
    : isFollowUp ? 'Follow-Up Assessment Report' : 'OPD Summary Report';

  return (
    <div style={{ background: '#fff', color: '#0f172a', fontFamily: 'sans-serif', width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '0' }}>

      {/* ── Accent top bar ── */}
      <div style={{ height: '5px', background: `linear-gradient(90deg, ${ac}, ${ac}55, transparent)` }} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 24px', gap: '16px', borderBottom: '1px solid #e2e8f0' }}>
        <ClinicLogo className="h-12" showText={false} printMode={true} clinicSettings={cs} />
        <div style={{ width: '1px', height: '40px', background: '#e2e8f0' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a' }}>{cs.clinicName || 'Lover Clinic'}</div>
          {cs.clinicSubtitle && <div style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{cs.clinicSubtitle}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '15px', fontWeight: '900', color: ac, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{reportTitle}</div>
          <div style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '2px' }}>{reportSubtitle}</div>
          <div style={{ marginTop: '6px', fontSize: '9px', color: '#64748b' }}>{formattedDate} · {formattedTime}</div>
        </div>
      </div>

      <div style={{ padding: '14px 24px 24px' }}>

        {/* ── Patient + Visit reason row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isFollowUp || isCustom ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>

          {/* Patient info */}
          <div style={card}>
            <div style={cardHeader()}>
              <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px' }} />
              <h4 style={cardTitle()}>ข้อมูลผู้ป่วย (Patient)</h4>
            </div>
            <div style={{ ...cardBody, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '10px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ชื่อ-สกุล / Name</span>
                <div style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', marginTop: '1px' }}>
                  {d.prefix !== 'ไม่ระบุ' ? d.prefix + ' ' : ''}{d.firstName} {d.lastName}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>อายุ</span>
                <div style={{ fontWeight: '700', color: '#1e293b' }}>{d.age} ปี</div>
              </div>
              {(!isFollowUp && !isCustom) && (
                <div>
                  <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>เพศ</span>
                  <div style={{ fontWeight: '700', color: '#1e293b' }}>{d.gender}</div>
                </div>
              )}
              {(isFollowUp || isCustom) && (
                <div>
                  <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>วันที่ประเมิน</span>
                  <div style={{ fontWeight: '700', color: '#1e293b' }}>{d.assessmentDate || '-'}</div>
                </div>
              )}
              {(!isFollowUp && !isCustom) && (
                <>
                  <div>
                    <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>วันเกิด</span>
                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{d.dobDay && d.dobMonth && d.dobYear ? `${d.dobDay}/${d.dobMonth}/${d.dobYear}` : '-'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>สัญชาติ</span>
                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{d.nationality === 'ต่างชาติ' ? (d.nationalityCountry || 'ต่างชาติ') : 'ไทย'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>โทรศัพท์</span>
                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{formatPhoneNumberDisplay(d.phone, d.isInternationalPhone, d.phoneCountryCode)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ฉุกเฉิน</span>
                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{d.emergencyName || '-'}{d.emergencyRelation ? ` (${d.emergencyRelation})` : ''}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ที่อยู่</span>
                    <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '9px' }}>{[d.address, d.subDistrict && `ต.${d.subDistrict}`, d.district && `อ.${d.district}`, d.province, d.postalCode].filter(Boolean).join(' ') || '-'}</div>
                  </div>
                  {d.currentMedication && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ยาที่ใช้ปัจจุบัน</span>
                      <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '9px' }}>{d.currentMedication}</div>
                    </div>
                  )}
                </>
              )}
              {/* Ref ID */}
              <div style={{ gridColumn: '1 / -1', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '8px', color: '#94a3b8', letterSpacing: '0.1em' }}>Session ID</span>
                <span style={{ fontFamily: 'monospace', fontSize: '9px', fontWeight: '700', color: ac, background: `${ac}12`, borderRadius: '4px', padding: '2px 6px' }}>{session.sessionId || session.id}</span>
              </div>
            </div>
          </div>

          {/* Visit reason */}
          {(!isFollowUp && !isCustom) && (
            <div style={card}>
              <div style={cardHeader('#475569')}>
                <div style={{ width: '3px', height: '12px', background: '#475569', borderRadius: '2px' }} />
                <h4 style={cardTitle('#475569')}>ความประสงค์ที่มารับบริการ</h4>
              </div>
              <div style={cardBody}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                  {reasons.map(r => (
                    <span key={r} style={{ fontSize: '10px', fontWeight: '700', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', color: '#334155' }}>
                      {r === 'อื่นๆ' ? `อื่นๆ: ${d.visitReasonOther}` : r}
                    </span>
                  ))}
                </div>
                {reasons.includes('เสริมฮอร์โมน') && goals.length > 0 && (
                  <>
                    <div style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '5px' }}>เป้าหมายเสริมฮอร์โมน</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {goals.map(g => (
                        <span key={g} style={{ fontSize: '9px', fontWeight: '700', border: `1px solid ${ac}50`, borderRadius: '5px', padding: '2px 7px', color: ac, background: `${ac}10` }}>
                          {g === 'ฮอร์โมนเพื่อการข้ามเพศ' ? `ข้ามเพศ (${d.hrtTransType})` : g === 'อื่นๆ' ? `อื่นๆ (${d.hrtOtherDetail})` : g}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ padding: '6px 8px', borderRadius: '6px', background: d.hasAllergies === 'มี' ? '#fff5f5' : '#f8fafc', border: `1px solid ${d.hasAllergies === 'มี' ? '#fca5a5' : '#e2e8f0'}` }}>
                    <div style={{ fontSize: '7px', fontWeight: '800', textTransform: 'uppercase', color: d.hasAllergies === 'มี' ? '#dc2626' : '#94a3b8', letterSpacing: '0.1em' }}>Allergy</div>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: d.hasAllergies === 'มี' ? '#dc2626' : '#475569', marginTop: '2px' }}>
                      {d.hasAllergies === 'มี' ? `⚠ ${d.allergiesDetail}` : 'NKDA'}
                    </div>
                  </div>
                  <div style={{ padding: '6px 8px', borderRadius: '6px', background: d.hasUnderlying === 'มี' ? '#fffbeb' : '#f8fafc', border: `1px solid ${d.hasUnderlying === 'มี' ? '#fcd34d' : '#e2e8f0'}` }}>
                    <div style={{ fontSize: '7px', fontWeight: '800', textTransform: 'uppercase', color: d.hasUnderlying === 'มี' ? '#d97706' : '#94a3b8', letterSpacing: '0.1em' }}>Underlying</div>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: d.hasUnderlying === 'มี' ? '#d97706' : '#475569', marginTop: '2px' }}>
                      {d.hasUnderlying === 'มี' ? 'มีประวัติ' : 'ไม่มี'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Custom form answers ── */}
        {isCustom && session.customTemplate && (
          <div style={card}>
            <div style={cardHeader()}>
              <div style={{ width: '3px', height: '12px', background: ac, borderRadius: '2px' }} />
              <h4 style={cardTitle()}>รายละเอียดคำตอบแบบฟอร์ม (Form Responses)</h4>
            </div>
            <div style={{ ...cardBody, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {session.customTemplate.questions.map((q, idx) => {
                const answer = d[q.id];
                let displayAns = '-';
                if (Array.isArray(answer)) displayAns = answer.length > 0 ? answer.join(', ') : '-';
                else if (answer) displayAns = answer;
                return (
                  <div key={q.id} style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px 10px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{idx + 1}. {q.label}</div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#1e293b' }}>{displayAns}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Clinical Score Cards ── */}
        {!isCustom && (isPerf || showAdam || showMrs) && (
          <>
            {/* Section divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0 12px' }}>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              <span style={{ fontSize: '8px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.15em', textTransform: 'uppercase' }}>ผลการประเมิน · Assessment Scores</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>

            {/* ADAM */}
            {showAdam && (() => {
              const adamRes = calculateADAM(d);
              const adamColor = adamRes.total >= 3 ? '#dc2626' : adamRes.total >= 1 ? '#f59e0b' : '#22c55e';
              return (
                <div style={card}>
                  <div style={cardHeader(adamColor)}>
                    <div style={{ width: '3px', height: '12px', background: adamColor, borderRadius: '2px' }} />
                    <h4 style={cardTitle(adamColor)}>แบบประเมินพร่องฮอร์โมนเพศชาย (ADAM Score)</h4>
                  </div>
                  <div style={cardBody}>
                    {/* Score summary row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 12px', background: `${adamColor}08`, borderRadius: '8px', marginBottom: '12px', border: `1px solid ${adamColor}20` }}>
                      <div style={{ textAlign: 'center', minWidth: '48px' }}>
                        <div style={{ fontSize: '28px', fontWeight: '900', color: adamColor, lineHeight: 1 }}>{adamRes.total}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8' }}>/ 10</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>{adamRes.text}</div>
                        <ScoreBar value={adamRes.total} max={10} color={adamColor} />
                      </div>
                    </div>
                    {/* Questions grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px' }}>
                      {[
                        { k: d.adam_1, t: 'ความต้องการทางเพศลดลง' },
                        { k: d.adam_2, t: 'รู้สึกขาดพลังงาน' },
                        { k: d.adam_3, t: 'ความแข็งแรง/ความทนทานลดลง' },
                        { k: d.adam_4, t: 'ส่วนสูงลดลง' },
                        { k: d.adam_5, t: 'ซึมเศร้า / ความสุขในชีวิตลดลง' },
                        { k: d.adam_6, t: 'อารมณ์แปรปรวน หงุดหงิดง่าย' },
                        { k: d.adam_7, t: 'การแข็งตัวของอวัยวะเพศลดลง' },
                        { k: d.adam_8, t: 'ความสามารถออกกำลังกายลดลง' },
                        { k: d.adam_9, t: 'ง่วงนอนหลังทานอาหารเย็น' },
                        { k: d.adam_10, t: 'ประสิทธิภาพการทำงานลดลง' },
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #f8fafc' }}>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>{i + 1}. {item.t}</span>
                          <span style={{ fontSize: '9px', fontWeight: '800', color: item.k ? adamColor : '#cbd5e1', minWidth: '28px', textAlign: 'right' }}>
                            {item.k ? '✓ YES' : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MRS */}
            {showMrs && (() => {
              const mrsRes = calculateMRS(d);
              const mrsColor = mrsRes.score >= 30 ? '#dc2626' : mrsRes.score >= 17 ? '#f59e0b' : mrsRes.score >= 9 ? '#3b82f6' : '#22c55e';
              return (
                <div style={card}>
                  <div style={cardHeader(mrsColor)}>
                    <div style={{ width: '3px', height: '12px', background: mrsColor, borderRadius: '2px' }} />
                    <h4 style={cardTitle(mrsColor)}>แบบประเมินอาการวัยทองหญิง (MRS — Menopause Rating Scale)</h4>
                  </div>
                  <div style={cardBody}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 12px', background: `${mrsColor}08`, borderRadius: '8px', border: `1px solid ${mrsColor}20` }}>
                      <div style={{ textAlign: 'center', minWidth: '48px' }}>
                        <div style={{ fontSize: '28px', fontWeight: '900', color: mrsColor, lineHeight: 1 }}>{mrsRes.score}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8' }}>/ 44</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>{mrsRes.text}</div>
                        <ScoreBar value={mrsRes.score} max={44} color={mrsColor} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* IIEF-5 */}
            {isPerf && (() => {
              const iiefScore = calculateIIEFScore(d);
              const interp = getIIEFInterpretation(iiefScore);
              const iiefColor = iiefScore <= 7 ? '#dc2626' : iiefScore <= 11 ? '#f97316' : iiefScore <= 16 ? '#f59e0b' : iiefScore <= 21 ? '#3b82f6' : '#22c55e';
              const iiefQs = [
                { k: 'iief_1', t: 'ความมั่นใจในการแข็งตัว' },
                { k: 'iief_2', t: 'แข็งตัวพอที่จะสอดใส่ได้' },
                { k: 'iief_3', t: 'คงความแข็งตัวระหว่างมีเพศสัมพันธ์' },
                { k: 'iief_4', t: 'คงความแข็งตัวจนเสร็จกิจ' },
                { k: 'iief_5', t: 'ความพึงพอใจในการมีเพศสัมพันธ์' },
              ];
              return (
                <div style={card}>
                  <div style={cardHeader(iiefColor)}>
                    <div style={{ width: '3px', height: '12px', background: iiefColor, borderRadius: '2px' }} />
                    <h4 style={cardTitle(iiefColor)}>สมรรถภาพทางเพศ (IIEF-5 / SHIM Score)</h4>
                  </div>
                  <div style={cardBody}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 12px', background: `${iiefColor}08`, borderRadius: '8px', marginBottom: '12px', border: `1px solid ${iiefColor}20` }}>
                      <div style={{ textAlign: 'center', minWidth: '48px' }}>
                        <div style={{ fontSize: '28px', fontWeight: '900', color: iiefColor, lineHeight: 1 }}>{iiefScore}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8' }}>/ 25</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>{interp.text}</div>
                        <ScoreBar value={iiefScore} max={25} color={iiefColor} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                      {iiefQs.map((q, i) => (
                        <div key={q.k} style={{ textAlign: 'center', padding: '8px 4px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: '18px', fontWeight: '900', color: iiefColor }}>{d[q.k] || 0}</div>
                          <div style={{ fontSize: '7px', color: '#94a3b8', marginTop: '3px', lineHeight: '1.3' }}>Q{i + 1}</div>
                          <div style={{ fontSize: '7px', color: '#64748b', marginTop: '1px', lineHeight: '1.3' }}>{q.t.substring(0, 14)}{q.t.length > 14 ? '…' : ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── Footer ── */}
        <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '8px', color: '#cbd5e1', letterSpacing: '0.1em' }}>{cs.clinicName} · ANALYTICS REPORT · CONFIDENTIAL</span>
          <span style={{ fontSize: '8px', color: '#cbd5e1', fontFamily: 'monospace' }}>Printed {formattedDate} · {formattedTime}</span>
        </div>
      </div>
    </div>
  );
}
