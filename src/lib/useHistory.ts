import { useCallback, useRef, useState, type SetStateAction } from 'react';

const LIMIT = 60;
const MERGE_MS = 500; // a slider drag or a pan is one step, not sixty

/** useState with undo/redo. `reset` swaps the value without recording a step (a new photo, say). */
export function useHistory<T>(init: T | (() => T)) {
  const [state, setState] = useState(init);
  const cur = useRef(state);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef(0);

  // History is kept outside React's updater so StrictMode's double-invoke can't record a step twice.
  const set = useCallback((next: SetStateAction<T>) => {
    const prev = cur.current;
    const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    if (Object.is(value, prev)) return;
    const now = Date.now();
    if (now - last.current > MERGE_MS) {
      past.current.push(prev);
      if (past.current.length > LIMIT) past.current.shift();
    }
    last.current = now;
    future.current = [];
    cur.current = value;
    setState(value);
  }, []);

  const step = (from: { current: T[] }, to: { current: T[] }) => {
    const value = from.current.pop();
    if (value === undefined) return;
    to.current.push(cur.current);
    cur.current = value;
    last.current = 0;
    setState(value);
  };
  const undo = useCallback(() => step(past, future), []);
  const redo = useCallback(() => step(future, past), []);
  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    last.current = 0;
    cur.current = value;
    setState(value);
  }, []);

  return [state, set, { undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }] as const;
}
