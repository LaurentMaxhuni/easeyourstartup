import type { DesignDocument } from "@/lib/design-studio/document";

export type EditorHistory = { past: DesignDocument[]; present: DesignDocument; future: DesignDocument[] };
export function createHistory(document: DesignDocument): EditorHistory {
  return { past: [], present: document, future: [] };
}
export function commitHistory(state: EditorHistory, document: DesignDocument): EditorHistory {
  if (JSON.stringify(state.present) === JSON.stringify(document)) return state;
  return { past: [...state.past.slice(-49), state.present], present: document, future: [] };
}
export function undoHistory(state: EditorHistory): EditorHistory {
  const previous = state.past.at(-1);
  return previous ? { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] } : state;
}
export function redoHistory(state: EditorHistory): EditorHistory {
  const next = state.future[0];
  return next ? { past: [...state.past, state.present], present: next, future: state.future.slice(1) } : state;
}
