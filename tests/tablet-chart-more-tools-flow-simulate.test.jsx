// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EditorToolRail from '../src/components/tablet-chart/EditorToolRail.jsx';

const base = () => ({
  tool: 'pen', setTool: vi.fn(), color: '#ef4444', setColor: vi.fn(), size: 4, setSize: vi.fn(),
  onUndo: vi.fn(), onRedo: vi.fn(), onClear: vi.fn(), onDelete: vi.fn(),
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('R1 tool rail — full toolset + color picker', () => {
  it('R1.1 renders all 9 tools', () => {
    render(<EditorToolRail {...base()} />);
    ['select', 'pen', 'highlighter', 'line', 'arrow', 'rect', 'circle', 'text', 'eraser']
      .forEach(id => expect(screen.getByTestId(`tool-${id}`)).toBeTruthy());
  });
  it('R1.2 clicking a tool calls setTool with its id', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.click(screen.getByTestId('tool-rect'));
    expect(p.setTool).toHaveBeenCalledWith('rect');
  });
  it('R1.3 freeform color picker calls setColor', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.input(screen.getByTestId('color-picker'), { target: { value: '#123456' } });
    expect(p.setColor).toHaveBeenCalledWith('#123456');
  });
  it('R1.4 delete button calls onDelete', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.click(screen.getByTestId('tool-delete'));
    expect(p.onDelete).toHaveBeenCalled();
  });
  it('R1.5 undo/redo/clear wired', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.click(screen.getByTestId('tool-undo')); expect(p.onUndo).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tool-redo')); expect(p.onRedo).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tool-clear')); expect(p.onClear).toHaveBeenCalled();
  });
  it('R1.6 size buttons call setSize', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.click(screen.getByTestId('size-8')); expect(p.setSize).toHaveBeenCalledWith(8);
  });
});
