const COLORS = ['#ef4444', '#3b82f6', '#111111', '#16a34a', '#d69e2e', '#805ad5'];
const SIZES = [4, 8, 14];
const TOOLS = [
  { id: 'select', label: '↖', title: 'เลือก/ย้าย/ปรับขนาด' },
  { id: 'pen', label: '✏️', title: 'ปากกา (แรงกด)' },
  { id: 'highlighter', label: '🖍️', title: 'ไฮไลต์' },
  { id: 'line', label: '╱', title: 'เส้นตรง' },
  { id: 'arrow', label: '↗', title: 'ลูกศร' },
  { id: 'rect', label: '▭', title: 'สี่เหลี่ยม' },
  { id: 'circle', label: '◯', title: 'วงกลม' },
  { id: 'text', label: 'T', title: 'ข้อความ' },
  { id: 'eraser', label: '🧽', title: 'ยางลบ (แตะ/ถูเพื่อลบ)' },
];

// Full tablet-editor tool rail: select / pen(pressure) / highlighter / line / arrow / rect /
// circle / text / eraser + delete-selected + undo/redo/clear + color palette + freeform picker
// + 3 sizes. data-testid contract preserved + extended (R1 + AV103).
// props: tool, setTool, color, setColor, size, setSize, onUndo, onRedo, onClear, onDelete
export default function EditorToolRail({ tool, setTool, color, setColor, size, setSize, onUndo, onRedo, onClear, onDelete }) {
  return (
    <div className="flex flex-col gap-1.5 p-2 bg-neutral-900 border-r border-neutral-800 items-center select-none overflow-y-auto">
      {TOOLS.map(t => (
        <button key={t.id} data-testid={`tool-${t.id}`} title={t.title} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}
          className={`w-11 h-11 rounded-lg text-lg flex items-center justify-center shrink-0 ${tool === t.id ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-200'}`}>{t.label}</button>
      ))}
      <button data-testid="tool-delete" title="ลบชิ้นที่เลือก" onClick={onDelete} className="w-11 h-11 rounded-lg bg-neutral-800 text-base shrink-0">🗑️</button>
      <div className="h-px w-6 bg-neutral-700 my-1" />
      <button data-testid="tool-undo" title="ย้อนกลับ" onClick={onUndo} className="w-11 h-11 rounded-lg bg-neutral-800 text-lg shrink-0">↩️</button>
      <button data-testid="tool-redo" title="ทำซ้ำ" onClick={onRedo} className="w-11 h-11 rounded-lg bg-neutral-800 text-lg shrink-0">↪️</button>
      <button data-testid="tool-clear" title="ล้างทั้งหมด" onClick={onClear} className="w-11 h-11 rounded-lg bg-neutral-800 text-xs shrink-0">ล้าง</button>
      <div className="h-px w-6 bg-neutral-700 my-1" />
      <div className="grid grid-cols-2 gap-1">
        {COLORS.map(c => (
          <button key={c} data-testid={`color-${c}`} onClick={() => setColor(c)}
            className="w-5 h-5 rounded-full" style={{ background: c, outline: color === c ? '2px solid #fff' : 'none' }} />
        ))}
      </div>
      <input data-testid="color-picker" type="color" value={color} onInput={e => setColor(e.target.value)} onChange={e => setColor(e.target.value)}
        className="w-9 h-6 rounded bg-transparent border border-neutral-600 cursor-pointer shrink-0" title="เลือกสีอิสระ" />
      <div className="flex flex-col gap-1 mt-1">
        {SIZES.map(s => (
          <button key={s} data-testid={`size-${s}`} onClick={() => setSize(s)}
            className={`w-6 h-6 rounded-full mx-auto shrink-0 ${size === s ? 'ring-2 ring-emerald-400' : ''}`}
            style={{ background: '#777', transform: `scale(${0.4 + s / 20})` }} />
        ))}
      </div>
    </div>
  );
}
