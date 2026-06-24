import { createContext, useContext, useReducer, useCallback, useRef, useEffect, type ReactNode } from "react";
import type { CanvasState, CanvasAction, CanvasElement } from "./types.ts";
import {
  addShape,
  updateShape,
  removeShape,
  removeShapes,
  importShapes,
  exportElements,
  isGeometryReady,
  initGeometry,
} from "../geometry/scene.ts";

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

    case "REPLACE_ELEMENTS":
      return {
        ...state,
        elements: action.elements,
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

function applyGeometryMutation(
  dispatch: React.Dispatch<CanvasAction>,
  mutate: () => CanvasElement[],
) {
  const elements = mutate();
  dispatch({ type: "REPLACE_ELEMENTS", elements });
}

function restoreSnapshot(
  dispatch: React.Dispatch<CanvasAction>,
  snapshot: Snapshot,
) {
  if (isGeometryReady()) {
    importShapes(snapshot.elements);
    dispatch({
      type: "RESTORE_SNAPSHOT",
      snapshot: {
        elements: exportElements(),
        selectedIds: snapshot.selectedIds,
      },
    });
  } else {
    dispatch({ type: "RESTORE_SNAPSHOT", snapshot });
  }
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
  const dragSnapshotTaken = useRef(false);
  const [, setTick] = useReducer((t: number) => t + 1, 0);

  useEffect(() => {
    initGeometry().then(() => {
      importShapes(state.elements);
      if (state.elements.length > 0) {
        dispatch({ type: "REPLACE_ELEMENTS", elements: exportElements() });
      }
    });
  }, []);

  const wrappedDispatch = useCallback(
    (action: CanvasAction) => {
      if (action.type === "UNDO") {
        if (past.current.length === 0) return;
        const prev = past.current.pop()!;
        future.current.push(takeSnapshot(state));
        restoreSnapshot(dispatch, prev);
        setTick();
        return;
      }

      if (action.type === "REDO") {
        if (future.current.length === 0) return;
        const next = future.current.pop()!;
        past.current.push(takeSnapshot(state));
        restoreSnapshot(dispatch, next);
        setTick();
        return;
      }

      if (MUTATION_ACTIONS.has(action.type)) {
        past.current.push(takeSnapshot(state));
        if (past.current.length > MAX_HISTORY) past.current.shift();
        future.current = [];
        dragSnapshotTaken.current = false;

        if (isGeometryReady()) {
          if (action.type === "ADD_ELEMENT") {
            applyGeometryMutation(dispatch, () => addShape(action.element));
          } else if (action.type === "DELETE_ELEMENT") {
            applyGeometryMutation(dispatch, () => removeShape(action.id));
          } else if (action.type === "DELETE_SELECTED") {
            applyGeometryMutation(dispatch, () =>
              removeShapes(state.selectedIds),
            );
          }
        } else {
          dispatch(action);
        }
        setTick();
        return;
      }

      if (action.type === "UPDATE_ELEMENT") {
        if (!dragSnapshotTaken.current) {
          past.current.push(takeSnapshot(state));
          if (past.current.length > MAX_HISTORY) past.current.shift();
          future.current = [];
          dragSnapshotTaken.current = true;
        }
        if (isGeometryReady()) {
          applyGeometryMutation(dispatch, () =>
            updateShape(action.id, action.changes),
          );
        } else {
          dispatch(action);
        }
        return;
      }

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
