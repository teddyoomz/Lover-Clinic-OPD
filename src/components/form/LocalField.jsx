// ─── LocalField — input/textarea with local state + onBlur commit ──────────
//
// Problem: TreatmentFormPage / SaleTab have 100+ useState calls each.
// A plain controlled input that calls setState on every keystroke triggers
// a full parent reconcile of 2200-3200 LOC, which feels laggy in dev mode
// (StrictMode 2× + unbundled ESM). The `eb0ea01` commit fixed OPD textareas
// this way; this file generalises the pattern so every noisy input on the
// form can adopt it in a one-line change.
//
// How it works:
//   - Local state (`local`) mirrors the incoming `value` prop.
//   - Keystrokes update `local` only — parent is NOT notified.
//   - `onBlur` commits `local` → parent via `onCommit`, wrapped in
//     `flushSync` so a following submit-button click sees fresh state.
//   - 180ms debounce is a backup for cases where the user never blurs
//     (rare — browser fires blur before click on a submit button).
//   - External changes (edit-mode restore, programmatic sets) sync back
//     into `local` via the `[value]` effect.
//
// Use by replacing `<input value={x} onChange={e => setX(e.target.value)} />`
// with `<LocalInput value={x} onCommit={setX} />`. Other props pass through.

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { flushSync } from 'react-dom';

const DEBOUNCE_MS = 180;

function useLocalField(value, onCommit) {
  const initial = value ?? '';
  const [local, setLocal] = useState(initial);
  const committed = useRef(initial);

  // Sync IN on external changes (edit-mode restore, button-driven set).
  useEffect(() => {
    const v = value ?? '';
    setLocal(v);
    committed.current = v;
  }, [value]);

  const commit = useCallback((next) => {
    if (next !== committed.current) {
      committed.current = next;
      onCommit?.(next);
    }
  }, [onCommit]);

  // Debounced backup commit while user is typing.
  useEffect(() => {
    if (local === committed.current) return undefined;
    const t = setTimeout(() => commit(local), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [local, commit]);

  const onChange = useCallback((e) => setLocal(e.target.value), []);
  const onBlur = useCallback(() => {
    if (local !== committed.current) flushSync(() => commit(local));
  }, [local, commit]);

  return { local, onChange, onBlur };
}

export const LocalInput = memo(function LocalInput({ value, onCommit, onBlur: onBlurExternal, onChange: onChangeExternal, ...rest }) {
  const { local, onChange, onBlur } = useLocalField(value, onCommit);
  return (
    <input
      value={local}
      onChange={(e) => { onChange(e); onChangeExternal?.(e); }}
      onBlur={(e) => { onBlur(); onBlurExternal?.(e); }}
      {...rest}
    />
  );
});

export const LocalTextarea = memo(function LocalTextarea({ value, onCommit, onBlur: onBlurExternal, onChange: onChangeExternal, ...rest }) {
  const { local, onChange, onBlur } = useLocalField(value, onCommit);
  return (
    <textarea
      value={local}
      onChange={(e) => { onChange(e); onChangeExternal?.(e); }}
      onBlur={(e) => { onBlur(); onBlurExternal?.(e); }}
      {...rest}
    />
  );
});
