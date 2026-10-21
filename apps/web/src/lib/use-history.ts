"use client";

import { useCallback, useState } from "react";

interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Changes with the same key in quick succession (typing, dragging) are one undo step. */
  key: string | null;
  at: number;
}

const HISTORY_LIMIT = 60;
const MERGE_MS = 1500;

/**
 * Undo and redo for an editor's draft (the ticket's, ADR 0094; the certificate's, ADR 0114). A
 * change with a key merges with the previous one of the same key made within 1.5 s, and a drag
 * (`drag-…`, one key per gesture) is one step however long it takes.
 */
export function useHistory<T>(initial: T) {
  const [history, setHistory] = useState<History<T>>({ past: [], present: initial, future: [], key: null, at: 0 });
  const change = useCallback((next: (draft: T) => T, key: string | null = null) => {
    setHistory((state) => {
      const now = Date.now();
      const merge = key !== null && key === state.key && (key.startsWith("drag-") || now - state.at < MERGE_MS);
      return {
        past: merge ? state.past : [...state.past.slice(-HISTORY_LIMIT), state.present],
        present: next(state.present),
        future: [],
        key,
        at: now,
      };
    });
  }, []);
  const undo = useCallback(() => {
    setHistory((state) => {
      const previous = state.past.at(-1);
      return previous === undefined
        ? state
        : { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], key: null, at: 0 };
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((state) => {
      const [next, ...rest] = state.future;
      return next === undefined ? state : { past: [...state.past, state.present], present: next, future: rest, key: null, at: 0 };
    });
  }, []);
  return { draft: history.present, change, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
