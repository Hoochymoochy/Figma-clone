import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { CanvasState, CanvasAction, CanvasElement } from "./types.ts";

// ---- mock design scene ------------------------------------------------------

const MOCK_ELEMENTS: CanvasElement[] = [
  // Artboard (phone frame)
  {
    id: "artboard",
    type: "rectangle",
    x: -200,
    y: -300,
    width: 400,
    height: 640,
    fill: "#2d2d2d",
    stroke: "#444444",
    strokeWidth: 2,
  },
  // Header bar
  {
    id: "header",
    type: "rectangle",
    x: -180,
    y: -280,
    width: 360,
    height: 48,
    fill: "#1e1e1e",
    stroke: "#333333",
    strokeWidth: 1,
  },
  // Avatar circle
  {
    id: "avatar",
    type: "circle",
    x: 120,
    y: -272,
    width: 32,
    height: 32,
    fill: "#FF6B6B",
    stroke: "#FF8787",
    strokeWidth: 1,
  },
  // Header title bar
  {
    id: "header-title",
    type: "rectangle",
    x: -100,
    y: -268,
    width: 120,
    height: 10,
    fill: "#666666",
    stroke: "transparent",
    strokeWidth: 0,
  },
  // Card 1
  {
    id: "card-1",
    type: "rectangle",
    x: -180,
    y: -210,
    width: 360,
    height: 80,
    fill: "#3a3a3a",
    stroke: "#444444",
    strokeWidth: 1,
  },
  // Card 1 — image placeholder
  {
    id: "card-1-img",
    type: "rectangle",
    x: -168,
    y: -198,
    width: 56,
    height: 56,
    fill: "#4A90D9",
    stroke: "#5BA0E9",
    strokeWidth: 1,
  },
  // Card 1 — title line
  {
    id: "card-1-title",
    type: "rectangle",
    x: -100,
    y: -196,
    width: 180,
    height: 10,
    fill: "#888888",
    stroke: "transparent",
    strokeWidth: 0,
  },
  // Card 1 — subtitle line
  {
    id: "card-1-sub",
    type: "rectangle",
    x: -100,
    y: -178,
    width: 140,
    height: 8,
    fill: "#555555",
    stroke: "transparent",
    strokeWidth: 0,
  },
  // Card 2
  {
    id: "card-2",
    type: "rectangle",
    x: -180,
    y: -112,
    width: 360,
    height: 80,
    fill: "#3a3a3a",
    stroke: "#444444",
    strokeWidth: 1,
  },
  // Card 2 — image placeholder
  {
    id: "card-2-img",
    type: "rectangle",
    x: -168,
    y: -100,
    width: 56,
    height: 56,
    fill: "#6BCB77",
    stroke: "#7BDB87",
    strokeWidth: 1,
  },
  // Card 2 — title line
  {
    id: "card-2-title",
    type: "rectangle",
    x: -100,
    y: -98,
    width: 200,
    height: 10,
    fill: "#888888",
    stroke: "transparent",
    strokeWidth: 0,
  },
  // Card 2 — subtitle line
  {
    id: "card-2-sub",
    type: "rectangle",
    x: -100,
    y: -80,
    width: 160,
    height: 8,
    fill: "#555555",
    stroke: "transparent",
    strokeWidth: 0,
  },
  // Bottom nav bar
  {
    id: "bottom-nav",
    type: "rectangle",
    x: -180,
    y: 278,
    width: 360,
    height: 44,
    fill: "#1e1e1e",
    stroke: "#333333",
    strokeWidth: 1,
  },
  // Bottom nav icons (4 small circles)
  ...[0, 1, 2, 3].map((i): CanvasElement => ({
    id: `nav-icon-${i}`,
    type: "circle",
    x: -140 + i * 88,
    y: 288,
    width: 18,
    height: 18,
    fill: i === 1 ? "#FFD93D" : "#555555",
    stroke: i === 1 ? "#FFE94D" : "#555555",
    strokeWidth: 1,
  })),
  // FAB (floating action button)
  {
    id: "fab",
    type: "circle",
    x: 120,
    y: 240,
    width: 44,
    height: 44,
    fill: "#4A90D9",
    stroke: "#5BA0E9",
    strokeWidth: 1,
  },
  // FAB icon (cross — small horizontal rect)
  {
    id: "fab-icon-h",
    type: "rectangle",
    x: 132,
    y: 259,
    width: 20,
    height: 4,
    fill: "#ffffff",
    stroke: "transparent",
    strokeWidth: 0,
  },
  // FAB icon (cross — small vertical rect)
  {
    id: "fab-icon-v",
    type: "rectangle",
    x: 140,
    y: 251,
    width: 4,
    height: 20,
    fill: "#ffffff",
    stroke: "transparent",
    strokeWidth: 0,
  },
];

const initialState: CanvasState = {
  elements: MOCK_ELEMENTS,
  selectedIds: [],
  viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
  tool: "select",
};

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
          el.id === action.id ? { ...el, ...action.changes } : el,
        ),
      };

    case "DELETE_ELEMENT":
      return {
        ...state,
        elements: state.elements.filter((el) => el.id !== action.id),
        selectedIds: state.selectedIds.filter((id) => id !== action.id),
      };

    case "SET_SELECTION":
      return {
        ...state,
        selectedIds: action.ids,
      };

    case "CLEAR_SELECTION":
      return {
        ...state,
        selectedIds: [],
      };

    case "SET_VIEWPORT":
      return {
        ...state,
        viewport: { ...state.viewport, ...action.viewport },
      };

    case "SET_TOOL":
      return {
        ...state,
        tool: action.tool,
      };

    default:
      return state;
  }
}

interface CanvasContextValue {
  state: CanvasState;
  dispatch: React.Dispatch<CanvasAction>;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(canvasReducer, initialState);

  return (
    <CanvasContext.Provider value={{ state, dispatch }}>
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
