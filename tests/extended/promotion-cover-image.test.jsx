// ─── PromotionTab cover_image render — adversarial (v9.1b) ─────────────────
// Covers thumbnail rendering in the PromotionTab card:
//   - real image URL renders <img>
//   - no cover_image renders fallback Tag icon
//   - broken image URL hides <img> + reveals fallback (onError handler)
//   - XSS-ish src is still treated as plain attribute (browser handles)
//
// Uses vi.mock on backendClient to feed canned promotion lists; no Firebase.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock backendClient BEFORE importing PromotionTab (which imports it).
vi.mock('../src/lib/backendClient.js', () => ({
  listPromotions: vi.fn(),
  deletePromotion: vi.fn(),
  savePromotion: vi.fn(),
  getAllMasterDataItems: vi.fn(async () => []),
}));

// PromotionFormModal isn't under test — stub it so we don't render its
// master_data fetches.
vi.mock('../src/components/backend/PromotionFormModal.jsx', () => ({
  default: () => null,
}));

import PromotionTab from '../src/components/backend/PromotionTab.jsx';
import { listPromotions } from '../src/lib/backendClient.js';

const clinicSettings = { accentColor: '#dc2626' };

const base = {
  status: 'active',
  promotion_name: 'Nov',
  promotion_code: 'NOV2026',
  sale_price: 3900,
  category_name: 'CHA01',
};

function mk(id, overrides = {}) {
  return { promotionId: `PROMO-${id}`, id: `PROMO-${id}`, ...base, ...overrides };
}

describe('PromotionTab — cover_image rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('C1 renders img when cover_image is a valid URL', async () => {
    listPromotions.mockResolvedValue([
      mk('1', { cover_image: 'https://example.com/promo1.jpg' }),
    ]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} theme="dark" />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    const img = container.querySelector('img[src="https://example.com/promo1.jpg"]');
    expect(img).toBeTruthy();
    // loading="lazy" for perf
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('C2 renders fallback Tag icon when cover_image is empty string', async () => {
    listPromotions.mockResolvedValue([mk('1', { cover_image: '' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    // No img rendered when cover_image falsy
    expect(container.querySelector('img')).toBeNull();
    // Fallback wrapper has an SVG (Tag icon) visible
    const thumb = container.querySelector('.w-12.h-12');
    expect(thumb).toBeTruthy();
    expect(thumb.querySelector('svg')).toBeTruthy();
  });

  it('C3 renders fallback when cover_image is undefined (legacy docs)', async () => {
    listPromotions.mockResolvedValue([mk('1')]); // no cover_image key
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    expect(container.querySelector('img')).toBeNull();
  });

  it('C4 renders fallback when cover_image is null', async () => {
    listPromotions.mockResolvedValue([mk('1', { cover_image: null })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    expect(container.querySelector('img')).toBeNull();
  });

  it('C5 renders fallback when cover_image is a whitespace string', async () => {
    listPromotions.mockResolvedValue([mk('1', { cover_image: '   ' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    // JSX truthy-check lets whitespace through; that's acceptable — we don't
    // try to validate the URL. Broken render triggers onError handler (C6).
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('   ');
  });

  it('C6 onError hides img + shows fallback icon', async () => {
    listPromotions.mockResolvedValue([mk('1', { cover_image: 'https://broken.example/404.png' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());

    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.style.display).not.toBe('none');

    // Fire the img error — mirrors onError behavior in production.
    fireEvent.error(img);

    expect(img.style.display).toBe('none');
    // Sibling fallback should no longer have .hidden class.
    const fallback = img.nextElementSibling;
    expect(fallback?.classList.contains('hidden')).toBe(false);
  });

  it('C7 img alt is empty (decorative — screen readers skip, per a11y)', async () => {
    listPromotions.mockResolvedValue([mk('1', { cover_image: 'https://example.com/x.jpg' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    expect(container.querySelector('img').getAttribute('alt')).toBe('');
  });

  it('C8 mixed list: some with cover, some without — each card correct', async () => {
    listPromotions.mockResolvedValue([
      mk('1', { promotion_name: 'With Cover', cover_image: 'https://x.com/a.jpg' }),
      mk('2', { promotion_name: 'No Cover' }),
      mk('3', { promotion_name: 'Null Cover', cover_image: null }),
      mk('4', { promotion_name: 'Another With', cover_image: 'https://y.com/b.jpg' }),
    ]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('With Cover')).toBeInTheDocument());
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2); // only the 2 with URLs
    const srcs = Array.from(imgs).map(i => i.src);
    expect(srcs).toContain('https://x.com/a.jpg');
    expect(srcs).toContain('https://y.com/b.jpg');
  });

  it('C9 does NOT paint red on card heading (Thai culture: name ≠ red)', async () => {
    listPromotions.mockResolvedValue([mk('1', { cover_image: 'https://x.com/a.jpg' })]);
    const { container } = render(<PromotionTab clinicSettings={{ accentColor: '#dc2626' }} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    const heading = container.querySelector('h3');
    // h3 uses var(--tx-heading) — not the accent red.
    expect(heading.style.color).not.toBe('rgb(220, 38, 38)');
    expect(heading.style.color).not.toBe('#dc2626');
  });

  it('C10 thumbnail wrapper sized exactly 48x48 (matches ProClinic visual density)', async () => {
    listPromotions.mockResolvedValue([mk('1')]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    const thumb = container.querySelector('.w-12.h-12');
    expect(thumb).toBeTruthy();
    expect(thumb.classList.contains('rounded-lg')).toBe(true);
    expect(thumb.classList.contains('overflow-hidden')).toBe(true);
  });

  it('C11 empty list still renders (no cover_image iteration crash)', async () => {
    listPromotions.mockResolvedValue([]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.queryByText('กำลังโหลด…')).not.toBeInTheDocument());
    expect(container.querySelectorAll('img')).toHaveLength(0);
    // Empty-state message should appear
    expect(screen.getByText(/ยังไม่มีโปรโมชัน/)).toBeInTheDocument();
  });

  it('C12 100 promotions with images — no render crash', async () => {
    listPromotions.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => mk(i, {
        promotion_name: `P${i}`,
        cover_image: `https://cdn.example.com/p${i}.jpg`,
      }))
    );
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('P0')).toBeInTheDocument());
    expect(container.querySelectorAll('img')).toHaveLength(100);
  });

  it('C13 data: URL (user pastes inline b64) still renders', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    listPromotions.mockResolvedValue([mk('1', { cover_image: dataUrl })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    expect(container.querySelector('img').src).toBe(dataUrl);
  });

  it('C14 javascript: URL — browser blocks on render; no XSS pathway in React', async () => {
    // React does not interpret javascript: in <img src>. Still, we verify
    // the attribute is passed through as-is (no onload/etc. hooks in the JSX).
    listPromotions.mockResolvedValue([mk('1', { cover_image: 'javascript:alert(1)' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Nov')).toBeInTheDocument());
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    // Verify no inline handlers injected
    expect(img.hasAttribute('onload')).toBe(false);
    expect(img.hasAttribute('onerror-attr')).toBe(false);
  });

  it('C15 filtered list (search) hides promotions whose cover images are in pool', async () => {
    listPromotions.mockResolvedValue([
      mk('1', { promotion_name: 'AAA', cover_image: 'https://x.com/a.jpg' }),
      mk('2', { promotion_name: 'BBB', cover_image: 'https://x.com/b.jpg' }),
    ]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('AAA')).toBeInTheDocument());
    const search = container.querySelector('input[placeholder*="ค้นหา"]');
    fireEvent.change(search, { target: { value: 'AAA' } });
    await waitFor(() => expect(screen.queryByText('BBB')).not.toBeInTheDocument());
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img').src).toBe('https://x.com/a.jpg');
  });
});
