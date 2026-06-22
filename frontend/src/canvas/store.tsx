import { createContext, useContext, useReducer, useCallback, useRef, type ReactNode } from "react";
import type { CanvasState, CanvasAction, CanvasElement } from "./types.ts";

const MAX_HISTORY = 50;

const initialState: CanvasState = {
  elements: [],
  selectedIds: [],
  viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
  tool: "select",
};

// ---- reducer ----------------------------------------------------------------

export function canvasReducer(
  state: CanvasState,
  action: CanvasAction,
): CanvasState {
  switch (action.type) {
    case "ADD_ELEMENT":
      return {
        ...state,
        elements: [...state.elements, action.element],
      };

    case "UPDATE_ELEMENT":
      return {
        ...state,
        elements: state.elements.map((el) =>
          el.id === action.id ? ({ ...el, ...action.changes } as CanvasElement) : el,
        ),
      };

    case "DELETE_ELEMENT":
      return {
        ...state,
        elements: state.elements.filter((el) => el.id !== action.id),
        selectedIds: state.selectedIds.filter((id) => id !== action.id),
      };

    case "DELETE_SELECTED":
      return {
        ...state,
        elements: state.elements.filter(
          (el) => !state.selectedIds.includes(el.id),
        ),
        selectedIds: [],
      };

    case "SET_SELECTION":
      return { ...state, selectedIds: action.ids };

    case "CLEAR_SELECTION":
      return { ...state, selectedIds: [] };

    case "SET_VIEWPORT":
      return {
        ...state,
        viewport: { ...state.viewport, ...action.viewport },
      };

    case "SET_TOOL":
      return { ...state, tool: action.tool };

    case "RESTORE_SNAPSHOT":
      return {
        ...state,
        elements: action.snapshot.elements,
        selectedIds: action.snapshot.selectedIds,
      };

    default:
      return state;
  }
}

// ---- context with history ---------------------------------------------------

type Snapshot = Pick<CanvasState, "elements" | "selectedIds">;

function takeSnapshot(state: CanvasState): Snapshot {
  return {
    elements: state.elements,
    selectedIds: state.selectedIds,
  };
}

// Actions that change elements (tracked in undo history)
const MUTATION_ACTIONS = new Set([
  "ADD_ELEMENT",
  "DELETE_ELEMENT",
  "DELETE_SELECTED",
]);

interface CanvasContextValue {
  state: CanvasState;
  dispatch: React.Dispatch<CanvasAction>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(canvasReducer, initialState);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  // Skip history push for UPDATE_ELEMENT during a drag sequence
  const dragSnapshotTaken = useRef(false);
  // Tick to force re-render when undo/redo state changes
  const [, setTick] = useReducer((t: number) => t + 1, 0);

  const wrappedDispatch = useCallback(
    (action: CanvasAction) => {
      // UNDO
      if (action.type === "UNDO") {
        if (past.current.length === 0) return;
        const prev = past.current.pop()!;
        future.current.push(takeSnapshot(state));
        dispatch({ type: "RESTORE_SNAPSHOT", snapshot: prev });
        setTick();
        return;
      }

      // REDO
      if (action.type === "REDO") {
        if (future.current.length === 0) return;
        const next = future.current.pop()!;
        past.current.push(takeSnapshot(state));
        dispatch({ type: "RESTORE_SNAPSHOT", snapshot: next });
        setTick();
        return;
      }

      // Snapshot before element-changing actions
      if (MUTATION_ACTIONS.has(action.type)) {
        past.current.push(takeSnapshot(state));
        if (past.current.length > MAX_HISTORY) past.current.shift();
        future.current = [];
        dragSnapshotTaken.current = false;
        dispatch(action);
        setTick();
        return;
      }

      // UPDATE_ELEMENT: snapshot on first call since last mutation / drag-start
      if (action.type === "UPDATE_ELEMENT") {
        if (!dragSnapshotTaken.current) {
          past.current.push(takeSnapshot(state));
          if (past.current.length > MAX_HISTORY) past.current.shift();
          future.current = [];
          dragSnapshotTaken.current = true;
        }
        dispatch(action);
        return;
      }

      // All other actions (selection, viewport, tool) — pass through
      dispatch(action);
    },
    [state],
  );

  const undo = useCallback(() => wrappedDispatch({ type: "UNDO" }), [wrappedDispatch]);
  const redo = useCallback(() => wrappedDispatch({ type: "REDO" }), [wrappedDispatch]);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  return (
    <CanvasContext.Provider value={{ state, dispatch: wrappedDispatch, undo, redo, canUndo, canRedo }}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvasContext(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) {
    throw new Error("useCanvasContext must be used within a CanvasProvider");
  }
  return ctx;
}
