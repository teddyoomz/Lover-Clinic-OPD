import { useState, useEffect } from 'react';
import { hexToRgb } from '../utils.js';
import { DEFAULT_CLINIC_SETTINGS } from '../constants.js';

export default function ClinicLogo({ className = "py-4", showText = true, forceLight = false, printMode = false, clinicSettings = null, center = false, theme = 'dark' }) {
  const [imgErrorDark, setImgErrorDark] = useState(false);
  const [imgErrorLight, setImgErrorLight] = useState(false);
  const cs = clinicSettings || DEFAULT_CLINIC_SETTINGS;

  const darkLogo  = cs.logoUrl      || '';
  const lightLogo = cs.logoUrlLight || '';

  // Reset error เมื่อ URL เปลี่ยน (เช่น หลัง upload โลโก้ใหม่)
  useEffect(() => { setImgErrorDark(false); }, [darkLogo]);
  useEffect(() => { setImgErrorLight(false); }, [lightLogo]);
  const clinicName = cs.clinicName || 'Lover Clinic';
  const accent = cs.accentColor || '#dc2626';
  const accentRgb = hexToRgb(accent);

  // Resolve which context we're in — printMode always treated as light (white paper)
  const isLightContext = forceLight || printMode
    || theme === 'light'
    || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches);

  // Pick the right logo URL
  const activeLogo  = isLightContext && lightLogo ? lightLogo : darkLogo;
  const imgError    = isLightContext && lightLogo ? imgErrorLight : imgErrorDark;
  const setImgError = isLightContext && lightLogo ? setImgErrorLight : setImgErrorDark;

  const textColor = (forceLight || printMode) ? 'text-black' : 'text-[var(--tx-heading)]';
  const shadow = (!forceLight && !printMode) ? `drop-shadow(0 0 15px rgba(${accentRgb},0.6))` : '';

  // Filter: light context without dedicated light logo → convert dark logo to black
  const needsFilter = isLightContext && !lightLogo;
  const filterStyle = needsFilter
    ? (darkLogo ? 'brightness(0)' : 'invert(1) contrast(2) grayscale(1)')
    : (printMode ? undefined : shadow || undefined);

  if (activeLogo && !imgError) {
    return (
      <img
        src={activeLogo}
        alt={`${clinicName} Logo`}
        className={`object-contain block ${className}`}
        style={{ filter: filterStyle, maxWidth: '100%' }}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: try /logo.jpg
  if (!activeLogo && !imgError) {
    return (
      <img
        src="/logo.jpg"
        alt={`${clinicName} Logo`}
        className={`object-contain block ${className}`}
        style={{ filter: needsFilter ? 'brightness(0)' : (printMode ? undefined : shadow || undefined), maxWidth: '100%' }}
        onError={() => setImgError(true)}
      />
    );
  }

  // Text fallback
  const visibilityClass = className.split(' ').filter(c => c.startsWith('hidden') || c.startsWith('block') || c.startsWith('sm:') || c.startsWith('md:')).join(' ');
  return (
    <div className={`flex flex-col ${center ? 'items-center' : 'items-start'} self-center select-none ${visibilityClass}`}>
      <div className="flex flex-col" style={{ lineHeight: 1.1 }}>
        {clinicName.split(' ').map((word, i) => (
          <span key={i} className="text-xl font-black tracking-wide block" style={{
            color: i === 0 ? accent : (forceLight || printMode ? '#000' : 'var(--tx-heading)'),
            filter: (i === 0 && !forceLight && !printMode) ? `drop-shadow(0 0 10px rgba(${accentRgb},0.6))` : 'none'
          }}>
            {word}
          </span>
        ))}
      </div>
      {showText && cs.clinicSubtitle && <div className={`text-xs font-bold tracking-[0.4em] ${textColor} mt-1.5 uppercase opacity-70`}>{cs.clinicSubtitle}</div>}
    </div>
  );
}
