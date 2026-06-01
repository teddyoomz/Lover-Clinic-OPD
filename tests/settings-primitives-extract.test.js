import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SectionCard, StatusBanner, SaveButton } from '../src/components/backend/SettingsPrimitives.jsx';

describe('SettingsPrimitives extraction (Rule C1)', () => {
  it('SettingsPrimitives.jsx exports the 3 shared components', () => {
    expect(typeof SectionCard).toBe('function');
    expect(typeof StatusBanner).toBe('function');
    expect(typeof SaveButton).toBe('function');
  });

  it('SystemSettingsTab imports them and no longer defines them locally', () => {
    const src = readFileSync('src/components/backend/SystemSettingsTab.jsx', 'utf8');
    expect(src).toMatch(/import \{[^}]*SectionCard[^}]*\} from '\.\/SettingsPrimitives\.jsx'/);
    expect(src).not.toMatch(/function SectionCard\(/);
    expect(src).not.toMatch(/function StatusBanner\(/);
    expect(src).not.toMatch(/function SaveButton\(/);
  });
});
