// Phase 10.9 — Wiring crosscut tests.
// Verifies navigation + URL deep-link + cmdk palette + ReportsHomeTab card
// click fires setActiveTab(...) correctly for all 10 Phase 10 report tabs
// (original 8 + Phase 10.X1 daily-revenue + 10.X2 staff-sales).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  NAV_SECTIONS,
  PINNED_ITEMS,
  ALL_ITEM_IDS,
  itemById,
  sectionOf,
} from '../src/components/backend/nav/navConfig.js';

const REPORT_TAB_IDS = [
  'reports',
  'reports-sale',
  'reports-customer',
  'reports-appointment',
  'reports-stock',
  'reports-rfm',
  'reports-revenue',
  'reports-appt-analysis',
  'reports-daily-revenue',  // 10.X1
  'reports-staff-sales',    // 10.X2
];

describe('navConfig — Phase 10 + 12.8 report items present', () => {
  it('reports section has 12 items (P10: 10 + P12.8: 2 new)', () => {
    // Phase 12.8 (2026-04-20) appended reports-pnl + reports-payment.
    const reportsSection = NAV_SECTIONS.find(s => s.id === 'reports');
    expect(reportsSection).toBeDefined();
    expect(reportsSection.items.length).toBe(12);
  });

  it('every report tab id is in ALL_ITEM_IDS whitelist (URL deep-link support)', () => {
    for (const id of REPORT_TAB_IDS) {
      expect(ALL_ITEM_IDS).toContain(id);
    }
  });

  it('itemById returns correct metadata for each report id', () => {
    for (const id of REPORT_TAB_IDS) {
      const item = itemById(id);
      expect(item).toBeTruthy();
      expect(item.id).toBe(id);
      expect(typeof item.label).toBe('string');
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it('sectionOf returns "reports" for every report tab', () => {
    for (const id of REPORT_TAB_IDS) {
      expect(sectionOf(id)).toBe('reports');
    }
  });

  it('every report item has a non-empty palette string (cmdk searchable)', () => {
    const reportsSection = NAV_SECTIONS.find(s => s.id === 'reports');
    for (const item of reportsSection.items) {
      expect(typeof item.palette).toBe('string');
      expect(item.palette.length).toBeGreaterThan(3);
    }
  });

  it('cmdk "rfm" keyword finds reports-rfm', () => {
    const item = itemById('reports-rfm');
    expect(item.palette.toLowerCase()).toContain('rfm');
  });

  it('cmdk "revenue" keyword finds reports-revenue', () => {
    const item = itemById('reports-revenue');
    expect(item.palette.toLowerCase()).toContain('revenue');
  });

  it('cmdk "kpi" / "performance" keyword finds reports-appt-analysis', () => {
    const item = itemById('reports-appt-analysis');
    expect(item.palette.toLowerCase()).toMatch(/kpi|performance/);
  });

  it('every report item has icon + color', () => {
    const reportsSection = NAV_SECTIONS.find(s => s.id === 'reports');
    for (const item of reportsSection.items) {
      expect(item.icon).toBeTruthy();       // lucide-react component
      expect(typeof item.color).toBe('string');
    }
  });
});

describe('PINNED_ITEMS — appointments is still pinned', () => {
  it('appointments is pinned (not nested in a section)', () => {
    expect(PINNED_ITEMS.some(i => i.id === 'appointments')).toBe(true);
  });
});

/* ─── ReportsHomeTab card → setActiveTab wiring ──────────────────────────── */

// Mock firebase for jsdom
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

import ReportsHomeTab from '../src/components/backend/reports/ReportsHomeTab.jsx';

describe('ReportsHomeTab — card clicks fire onNavigate with correct tabId', () => {
  it('clicking "การขาย" card fires onNavigate("reports-sale")', () => {
    const onNavigate = vi.fn();
    render(<ReportsHomeTab onNavigate={onNavigate} clinicSettings={{}} />);
    const saleCard = screen.getAllByText('การขาย').find(el => el.closest('button'));
    fireEvent.click(saleCard.closest('button'));
    expect(onNavigate).toHaveBeenCalledWith('reports-sale');
  });

  it('clicking CRM Insight analytics card fires onNavigate("reports-rfm")', () => {
    const onNavigate = vi.fn();
    render(<ReportsHomeTab onNavigate={onNavigate} clinicSettings={{}} />);
    const rfmBtn = screen.getByText(/CRM Insight/).closest('button');
    fireEvent.click(rfmBtn);
    expect(onNavigate).toHaveBeenCalledWith('reports-rfm');
  });

  it('clicking "สต็อคสินค้า" category card fires onNavigate("reports-stock")', () => {
    const onNavigate = vi.fn();
    render(<ReportsHomeTab onNavigate={onNavigate} clinicSettings={{}} />);
    const stockBtn = screen.getAllByText('สต็อคสินค้า').find(el => el.closest('button'));
    fireEvent.click(stockBtn.closest('button'));
    expect(onNavigate).toHaveBeenCalledWith('reports-stock');
  });

  it('"Smart Audience" analytics card (tabId=null) is disabled (no onNavigate)', () => {
    const onNavigate = vi.fn();
    render(<ReportsHomeTab onNavigate={onNavigate} clinicSettings={{}} />);
    const smartBtn = screen.getByText(/Smart Audience/).closest('button');
    fireEvent.click(smartBtn);
    // Either disabled OR onNavigate not called with null
    const callArgs = onNavigate.mock.calls.map(c => c[0]);
    expect(callArgs).not.toContain(null);
  });

  it('6 category sections render', () => {
    const onNavigate = vi.fn();
    render(<ReportsHomeTab onNavigate={onNavigate} clinicSettings={{}} />);
    expect(screen.getByTestId('category-sales')).toBeInTheDocument();
    expect(screen.getByTestId('category-marketing')).toBeInTheDocument();
    expect(screen.getByTestId('category-customer')).toBeInTheDocument();
    expect(screen.getByTestId('category-general')).toBeInTheDocument();
    expect(screen.getByTestId('category-expense')).toBeInTheDocument();
    expect(screen.getByTestId('category-stock')).toBeInTheDocument();
  });

  it('4 analytics cards render (RFM / Revenue / Appt-Analysis / Smart-Audience)', () => {
    const onNavigate = vi.fn();
    render(<ReportsHomeTab onNavigate={onNavigate} clinicSettings={{}} />);
    expect(screen.getByText(/CRM Insight/)).toBeInTheDocument();
    expect(screen.getByText(/วิเคราะห์รายได้ตามหัตถการ/)).toBeInTheDocument();
    expect(screen.getByText(/วิเคราะห์นัดหมาย/)).toBeInTheDocument();
    expect(screen.getByText(/Smart Audience/)).toBeInTheDocument();
  });
});

/* ─── Aggregator cross-check: ReportsHomeTab tabIds match navConfig IDs ─── */

describe('ReportsHomeTab tabId references are all valid navConfig IDs', () => {
  it('every active card links to a real tab id in ALL_ITEM_IDS', async () => {
    // Re-import by reading source file — simpler + static check
    const src = await import('../src/components/backend/reports/ReportsHomeTab.jsx?raw')
      .catch(async () => {
        // Fallback: read via fs
        const fs = await import('fs');
        return { default: fs.readFileSync('src/components/backend/reports/ReportsHomeTab.jsx', 'utf-8') };
      });
    const text = src.default;
    // Extract all tabId strings like: tabId: 'reports-xxx'
    const matches = [...text.matchAll(/tabId:\s*['"]([^'"]+)['"]/g)];
    const extractedTabIds = matches.map(m => m[1]);
    for (const id of extractedTabIds) {
      expect(ALL_ITEM_IDS).toContain(id);
    }
  });
});
