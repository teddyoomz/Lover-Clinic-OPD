import { describe, it, expect, vi } from 'vitest';
import { outlineToSvgPath, strokeOutline, PEN_PRESETS } from '../src/lib/penStroke.js';
import { TOOL_IDS, isDrawTool, isShapeTool, shapeObjectType } from '../src/lib/tabletChartTools.js';

describe('U1 outlineToSvgPath', () => {
  it('U1.1 empty outline → empty string', () => {
    expect(outlineToSvgPath([])).toBe('');
    expect(outlineToSvgPath(null)).toBe('');
    expect(outlineToSvgPath(undefined)).toBe('');
  });
  it('U1.2 builds a closed M/L/Z path', () => {
    const d = outlineToSvgPath([[0, 0], [10, 0], [10, 10]]);
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d).toContain('L10 0');
    expect(d.endsWith('Z')).toBe(true);
  });
  it('U1.3 real perfect-freehand outline → non-empty closed path', () => {
    const out = strokeOutline([[0, 0, 0.5], [5, 5, 0.6], [10, 2, 0.5]], PEN_PRESETS.pen(4));
    const d = outlineToSvgPath(out);
    expect(d.length).toBeGreaterThan(5);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
  it('U1.4 rounds coordinates to 2dp', () => {
    const d = outlineToSvgPath([[1.23456, 2.98765], [3.1, 4.2]]);
    expect(d).toContain('M1.23 2.99');
    expect(d).not.toMatch(/\d\.\d{3,}/);
  });
});

describe('U2 tool descriptors', () => {
  it('U2.1 TOOL_IDS lists all 9 tools in order', () => {
    expect(TOOL_IDS).toEqual(['select', 'pen', 'highlighter', 'line', 'arrow', 'rect', 'circle', 'text', 'eraser']);
  });
  it('U2.2 isDrawTool only pen/highlighter', () => {
    expect(isDrawTool('pen')).toBe(true);
    expect(isDrawTool('highlighter')).toBe(true);
    expect(isDrawTool('line')).toBe(false);
    expect(isDrawTool('select')).toBe(false);
    expect(isDrawTool('eraser')).toBe(false);
  });
  it('U2.3 isShapeTool line/arrow/rect/circle', () => {
    expect(['line', 'arrow', 'rect', 'circle'].every(isShapeTool)).toBe(true);
    expect(isShapeTool('pen')).toBe(false);
    expect(isShapeTool('text')).toBe(false);
    expect(isShapeTool('select')).toBe(false);
  });
  it('U2.4 shapeObjectType maps each tool to its fabric type', () => {
    expect(shapeObjectType('rect')).toBe('rect');
    expect(shapeObjectType('circle')).toBe('ellipse');
    expect(shapeObjectType('line')).toBe('line');
    expect(shapeObjectType('arrow')).toBe('group');
    expect(shapeObjectType('text')).toBe('textbox');
    expect(shapeObjectType('pen')).toBe('path');
    expect(shapeObjectType('highlighter')).toBe('path');
  });
});
