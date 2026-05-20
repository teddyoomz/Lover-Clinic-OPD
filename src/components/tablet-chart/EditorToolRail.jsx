const COLORS = ['#ef4444', '#3b82f6', '#111111', '#16a34a'];
const SIZES = [4, 8, 14];

// props: tool, setTool, color, setColor, size, setSize, onUndo, onRedo, onClear
export default function EditorToolRail({ tool, setTool, color, setColor, size, setSize, onUndo, onRedo, onClear }) {
  const Btn = ({ id, label, active }) => (
    <button data-testid={`tool-${id}`} aria-pressed={active} onClick={() => setTool(id)}
      className={`w-12 h-12 rounded-lg text-xl flex items-center justify-center ${active ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-200'}`}>{label}</button>
  );
  return (
    <div className="flex flex-col gap-2 p-2 bg-neutral-900 border-r border-neutral-800 items-center select-none">
      <Btn id="pen" label="✏️" active={tool === 'pen'} />
      <Btn id="highlighter" label="🖍️" active={tool === 'highlighter'} />
      <Btn id="eraser" label="🩹" active={tool === 'eraser'} />
      <button data-testid="tool-undo" onClick={onUndo} className="w-12 h-12 rounded-lg bg-neutral-800 text-xl">↩️</button>
      <button data-testid="tool-redo" onClick={onRedo} className="w-12 h-12 rounded-lg bg-neutral-800 text-xl">↪️</button>
      <button data-testid="tool-clear" onClick={onClear} className="w-12 h-12 rounded-lg bg-neutral-800 text-xs">ล้าง</button>
      <div className="h-px w-6 bg-neutral-700 my-1" />
      {COLORS.map(c => (
        <button key={c} data-testid={`color-${c}`} onClick={() => setColor(c)}
          className="w-6 h-6 rounded-full" style={{ background: c, outline: color === c ? '2px solid #fff' : 'none' }} />
      ))}
      <div className="flex flex-col gap-1 mt-1">
        {SIZES.map(s => (
          <button key={s} data-testid={`size-${s}`} onClick={() => setSize(s)}
            className={`w-6 h-6 rounded-full mx-auto ${size === s ? 'ring-2 ring-emerald-400' : ''}`}
            style={{ background: '#777', transform: `scale(${0.4 + s / 20})` }} />
        ))}
      </div>
    </div>
  );
}
