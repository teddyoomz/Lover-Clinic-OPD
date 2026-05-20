import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditorToolRail from '../src/components/tablet-chart/EditorToolRail.jsx';

// Note: jsdom has no Canvas 2D context or PointerEvents → PenCanvas drawing math is
// covered by pen-stroke.test.js (pure) + the Rule Q L1 real-iPad hands-on. RTL covers the tool rail.
describe('EditorToolRail', () => {
  it('PC1 selecting a tool calls setTool', () => {
    const setTool = vi.fn();
    render(<EditorToolRail tool="pen" setTool={setTool} color="#ef4444" setColor={() => {}} size={4} setSize={() => {}} onUndo={() => {}} onRedo={() => {}} onClear={() => {}} />);
    fireEvent.click(screen.getByTestId('tool-eraser'));
    expect(setTool).toHaveBeenCalledWith('eraser');
  });
  it('PC2 undo/redo/clear wired', () => {
    const onUndo = vi.fn(), onRedo = vi.fn(), onClear = vi.fn();
    render(<EditorToolRail tool="pen" setTool={() => {}} color="#ef4444" setColor={() => {}} size={4} setSize={() => {}} onUndo={onUndo} onRedo={onRedo} onClear={onClear} />);
    fireEvent.click(screen.getByTestId('tool-undo')); expect(onUndo).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tool-redo')); expect(onRedo).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tool-clear')); expect(onClear).toHaveBeenCalled();
  });
  it('PC3 color + size selection wired', () => {
    const setColor = vi.fn(), setSize = vi.fn();
    render(<EditorToolRail tool="pen" setTool={() => {}} color="#ef4444" setColor={setColor} size={4} setSize={setSize} onUndo={() => {}} onRedo={() => {}} onClear={() => {}} />);
    fireEvent.click(screen.getByTestId('color-#3b82f6')); expect(setColor).toHaveBeenCalledWith('#3b82f6');
    fireEvent.click(screen.getByTestId('size-14')); expect(setSize).toHaveBeenCalledWith(14);
  });
});
